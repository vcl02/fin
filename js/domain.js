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
    });
    categorias.forEach(({ nome, lancamentos: itens }) => {
        if (itens.length === 1) {
            const { id, nome: nomeLancamento } = itens[0];
            avisos.push(`Categoria "${nome}" aparece em apenas um lançamento: "${nomeLancamento}" (id ${id}).`);
        }
    });
    return { inconsistencias, avisos };
}
