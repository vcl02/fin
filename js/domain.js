// Vocabulário financeiro e contratos de dados compartilhados por todos os módulos.
// Mantém nomes e invariantes em um só lugar sem introduzir framework ou camada de banco.

/**
 * @typedef {Object} Lancamento
 * @property {number|string} id Identificador real ou temporário.
 * @property {string|null} data Data ISO do débito; créditos usam também fatura.
 * @property {number|string} valor Valor persistido: entrada positiva, saída negativa.
 * @property {string} nome Nome exato usado para classificações por nome.
 * @property {string|null} categ Categoria livre do lançamento.
 * @property {boolean} cred Indica compra no cartão detalhado.
 * @property {boolean} pago Indica se o movimento já ocorreu.
 * @property {string|null} fatura Vencimento escolhido para crédito/antecipação.
 */

/** @typedef {{ ini: string, fat: string, id?: string }} Ciclo */

const NOME_ANCORA_CICLO = 'Faturamento PJ';
const CATEGORIA_INVESTIMENTO = 'Investimento';
// Teto mensal de "besteira" (cafés, milkshakes, lanches/doces com a Isabella, Uber não
// essencial), somando Débito e Crédito do mesmo ciclo — um único limite pros dois, não um
// por bloco. Fixo em código de propósito: é uma meta pessoal, não dado editável na tela.
const CATEGORIA_BESTEIRA = 'Besteira';
const LIMITE_BESTEIRA = 250;
// Limite único contratado do cartão. A tela permite ajustá-lo como preferência local;
// garantia positiva do ciclo é somada separadamente, sem alterar este valor-base.
let LIMITE_CARTAO = 3350;

function definirLimiteCartao(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) return false;
    LIMITE_CARTAO = Math.round(numero * 100) / 100;
    return true;
}

const limiteCartaoContratado = () => LIMITE_CARTAO;
const TOLERANCIA_FINANCEIRA = 0.005;
const PREFIXO_LINHA_SINTETICA = /^(fat|cp|sal|res|sug|abt):/;

const ehDataIso = valor => !valor || /^\d{4}-\d{2}-\d{2}$/.test(String(valor).slice(0, 10));
const ehBooleanoOuNulo = valor => valor == null || typeof valor === 'boolean';
// A categoria é texto livre; para o diagnóstico, diferenças só de espaço, caixa ou acento
// não devem criar falsos positivos como se fossem categorias distintas.
const chaveCategoria = valor => String(valor ?? '').trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Diagnóstico conservador da resposta do Supabase. Ele não altera nem exclui linhas:
// inconsistências apontam contrato de dados inválido; avisos são apenas sinais para revisão.
// Toda nova regra personalizada entra aqui na lista adequada e aparece no mesmo modal.
function validarLancamentosCarregados(lancamentos) {
    const inconsistencias = [];
    const avisos = [];
    if (!Array.isArray(lancamentos)) return { inconsistencias: ['Supabase não retornou uma lista de lançamentos.'], avisos };
    const categorias = new Map();
    // Vencimento de fatura deve ter um único dia por mês: o mesmo cartão não fecha duas
    // vezes no mesmo mês. Agrupa por "AAAA-MM" -> dia -> lançamentos que usaram aquele dia.
    const faturasPorMes = new Map();

    lancamentos.forEach((lancamento, indice) => {
        const prefixo = `Lançamento ${indice + 1}${lancamento?.id != null ? ` (id ${lancamento.id})` : ''}`;
        if (!lancamento || typeof lancamento !== 'object') { inconsistencias.push(`${prefixo}: registro inválido.`); return; }
        if (!String(lancamento.nome || '').trim()) inconsistencias.push(`${prefixo}: nome ausente.`);
        if (!Number.isFinite(Number(lancamento.valor))) inconsistencias.push(`${prefixo}: valor não numérico.`);
        if (!ehDataIso(lancamento.data)) inconsistencias.push(`${prefixo}: data fora do formato ISO.`);
        if (lancamento.fatura && !ehDataIso(lancamento.fatura)) inconsistencias.push(`${prefixo}: vencimento de fatura fora do formato ISO.`);
        ['cred', 'pago'].forEach(campo => {
            if (!ehBooleanoOuNulo(lancamento[campo])) inconsistencias.push(`${prefixo}: ${campo} precisa ser booleano.`);
        });
        if (lancamento.cred === true && !(lancamento.fatura || lancamento.fatura_id)) {
            inconsistencias.push(`${prefixo}: crédito sem fatura vinculada.`);
        }

        // Uma célula pode conter várias categorias separadas por vírgula. O diagnóstico
        // avalia cada item separadamente, como o formulário faz.
        categoriasSeparadas(lancamento.categ).forEach(categoria => {
            const chave = chaveCategoria(categoria);
            const grupo = categorias.get(chave) || { nome: categoria, lancamentos: [] };
            // O aviso precisa identificar a linha rapidamente no modal, sem exigir busca pelo id.
            grupo.lancamentos.push({
                id: lancamento.id ?? indice + 1,
                nome: String(lancamento.nome || '').trim() || 'sem nome',
            });
            categorias.set(chave, grupo);
        });

        if (lancamento.fatura && ehDataIso(lancamento.fatura)) {
            const [ano, mes, dia] = String(lancamento.fatura).slice(0, 10).split('-');
            const chaveMes = `${ano}-${mes}`;
            const porDia = faturasPorMes.get(chaveMes) || new Map();
            const itensDoDia = porDia.get(dia) || [];
            itensDoDia.push({ id: lancamento.id ?? indice + 1, nome: String(lancamento.nome || '').trim() || 'sem nome' });
            porDia.set(dia, itensDoDia);
            faturasPorMes.set(chaveMes, porDia);
        }
    });
    categorias.forEach(({ nome, lancamentos: itens }) => {
        if (itens.length === 1) {
            const { id, nome: nomeLancamento } = itens[0];
            avisos.push(`Categoria "${nome}" aparece em apenas um lançamento: "${nomeLancamento}" (id ${id}).`);
        }
    });
    faturasPorMes.forEach((porDia, chaveMes) => {
        if (porDia.size <= 1) return;
        const dias = [...porDia.keys()].sort();
        const exemplos = dias.map(dia => {
            const [{ id, nome: nomeLancamento }] = porDia.get(dia);
            return `dia ${dia} (ex.: "${nomeLancamento}", id ${id})`;
        }).join(', ');
        avisos.push(`Fatura de ${chaveMes} tem vencimento em mais de um dia: ${exemplos}. Cada mês deveria ter um único dia de fatura.`);
    });

    // "Hoje" do Débito e do Crédito (ver finance.js: lancamentosPagos) conta qualquer
    // lançamento com pago = true sem olhar a data. No Débito isso é direto: pago no ciclo
    // seguinte (ou além) já é cedo demais. No Crédito, pago = true é "compra confirmada",
    // não "fatura paga" — e a própria prévia do Crédito mostra por design os créditos da
    // competência N+1 no ciclo N (ver REGRAS.md), então fatura no PRÓXIMO ciclo é o
    // normal esperado. Só fatura dois ciclos ou mais à frente foge dessa prévia e é sinal
    // de revisão (ex.: mesma falha de recorrência nascer paga, só que do lado do Crédito).
    if (typeof hojeISO === 'function') {
        const ancorasOrdenadas = lancamentos
            .filter(r => r && !r.cred && String(r.nome || '').trim() === NOME_ANCORA_CICLO && ehDataIso(r.data) && r.data)
            .map(r => String(r.data).slice(0, 10))
            .sort();
        const hoje = hojeISO();
        const idxHoje = ancorasOrdenadas.reduce((achado, data, i) => data <= hoje ? i : achado, -1);
        const inicioProximoCiclo = idxHoje >= 0 ? ancorasOrdenadas[idxHoje + 1] : null;
        const inicioDoisCiclosAFrente = idxHoje >= 0 ? ancorasOrdenadas[idxHoje + 2] : null;
        if (inicioProximoCiclo || inicioDoisCiclosAFrente) {
            lancamentos.forEach((lancamento, indice) => {
                if (!lancamento || lancamento.pago !== true) return;
                // A própria âncora do próximo ciclo sempre data exatamente nesse início —
                // ela não é uma despesa pré-paga por engano, é o marcador estrutural do ciclo.
                if (!lancamento.cred && String(lancamento.nome || '').trim() === NOME_ANCORA_CICLO) return;
                const fronteira = lancamento.cred ? inicioDoisCiclosAFrente : inicioProximoCiclo;
                if (!fronteira) return;
                const dataRelevante = lancamento.cred ? lancamento.fatura : lancamento.data;
                if (!dataRelevante || !ehDataIso(dataRelevante)) return;
                if (String(dataRelevante).slice(0, 10) < fronteira) return;
                const prefixo = `Lançamento ${indice + 1}${lancamento.id != null ? ` (id ${lancamento.id})` : ''}`;
                const rotuloData = lancamento.cred ? 'vencimento de fatura' : 'data';
                const alemDe = lancamento.cred ? 'dois ciclos à frente (além da prévia normal de 1 ciclo)' : 'um ciclo futuro, fora do atual';
                avisos.push(`${prefixo}: marcado como pago com ${rotuloData} em ${String(dataRelevante).slice(0, 10)} — cai ${alemDe}.`);
            });
        }
    }
    return { inconsistencias, avisos };
}
