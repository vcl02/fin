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
 * @property {boolean} isa Indica titular Isabella, não um segundo cartão.
 * @property {boolean} pago Indica se o movimento já ocorreu.
 * @property {boolean} ativo Indica se entra nos cálculos.
 * @property {string|null} fatura Vencimento escolhido para crédito/antecipação.
 */

/** @typedef {{ ini: string, fat: string, id?: string }} Ciclo */

const NOME_ANCORA_CICLO = 'Faturamento PJ';
const CATEGORIA_INVESTIMENTO = 'Investimento';
const TOLERANCIA_FINANCEIRA = 0.005;
const PREFIXO_LINHA_SINTETICA = /^(fat|cp|sal|res|sug|abt):/;

const ehDataIso = valor => !valor || /^\d{4}-\d{2}-\d{2}$/.test(String(valor).slice(0, 10));
const ehBooleanoOuNulo = valor => valor == null || typeof valor === 'boolean';

// Diagnóstico conservador da resposta do Supabase. Ele não altera nem exclui linhas:
// dados históricos continuam visíveis, mas uma inconsistência fica explícita no console.
function validarLancamentosCarregados(lancamentos) {
    const avisos = [];
    if (!Array.isArray(lancamentos)) return ['Supabase não retornou uma lista de lançamentos.'];

    lancamentos.forEach((lancamento, indice) => {
        const prefixo = `Lançamento ${indice + 1}${lancamento?.id != null ? ` (id ${lancamento.id})` : ''}`;
        if (!lancamento || typeof lancamento !== 'object') { avisos.push(`${prefixo}: registro inválido.`); return; }
        if (!String(lancamento.nome || '').trim()) avisos.push(`${prefixo}: nome ausente.`);
        if (!Number.isFinite(Number(lancamento.valor))) avisos.push(`${prefixo}: valor não numérico.`);
        if (!ehDataIso(lancamento.data)) avisos.push(`${prefixo}: data fora do formato ISO.`);
        if (lancamento.fatura && !ehDataIso(lancamento.fatura)) avisos.push(`${prefixo}: vencimento de fatura fora do formato ISO.`);
        ['cred', 'isa', 'pago', 'ativo', 'reserva'].forEach(campo => {
            if (!ehBooleanoOuNulo(lancamento[campo])) avisos.push(`${prefixo}: ${campo} precisa ser booleano.`);
        });
        if (lancamento.cred === true && !(lancamento.fatura || lancamento.fatura_id)) {
            avisos.push(`${prefixo}: crédito sem fatura vinculada.`);
        }
    });
    return avisos;
}
