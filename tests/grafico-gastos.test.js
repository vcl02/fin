// Pizza de gastos: agrupa despesas reais e evita contar transferência de fatura duas vezes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const inicio = fonte.indexOf('function dadosDoGraficoCiclo');
const fim = fonte.indexOf('\n// clique numa celula', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou os dados da pizza de gastos.');

function dadosDoGrafico(lancamentos) {
    const contexto = {
        Estado: { ciclos: [{ fat: '2026-10-12' }], lancamentos },
        ehTransferenciaFatura: r => !r.cred && /antecipação de fatura/i.test(`${r.nome || ''} ${r.categ || ''}`),
        ajusteDoCicloContaUnica: () => null,
        textoOuTraco: valor => String(valor || '-'),
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\nglobalThis.dados = dadosDoGraficoCiclo;`, contexto);
    return contexto.dados(0);
}

test('pizza mostra apenas débitos categorizados, sem crédito ou antecipação', () => {
    const dados = dadosDoGrafico([
        { periodoIdx: 0, cred: false, nome: 'Mercado', categ: 'Casa', v: -100 },
        { periodoIdx: 0, cred: false, nome: 'Antecipação de Fatura', categ: 'Fatura', v: -200 },
        { periodoIdx: 0, cred: true, nome: 'Compra cartão', categ: 'Eletrônicos', v: -300 },
    ]);

    assert.deepEqual({ ...dados.porCategoria }, { Casa: 100 });
});
