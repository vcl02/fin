// Regra de orçamento: Comprometido usa o Faturamento PJ do próprio ciclo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const inicio = fonte.indexOf('const LIMITES_COMPROMISSOS =');
const fim = fonte.indexOf('\nfunction dadosDoGraficoCiclo(', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou o cálculo de compromissos do ciclo.');

const contexto = {
    NOME_ANCORA_CICLO: 'Faturamento PJ', TOLERANCIA_FINANCEIRA: 0.005,
    semAcento: valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
};
vm.createContext(contexto);
vm.runInContext(`${fonte.slice(inicio, fim)}; globalThis.calcular = dadosCompromissosDoCiclo;`, contexto);

test('Comprometido usa crédito e débito contra 50% do faturamento do ciclo', () => {
    const d = contexto.calcular([
        { nome: 'Faturamento PJ', categ: 'Évora', v: 10000 },
        { nome: 'Curso', categ: 'Casa, Comprometido', v: -900, cred: true },
        { nome: 'Aluguel', categ: 'Comprometido', v: -3500, cred: false },
        { nome: 'Antecipação', categ: 'Comprometido', v: -700, _transferencia: true },
    ]);
    const [comprometido] = d.limites;
    assert.equal(d.faturamento, 10000);
    assert.equal(comprometido.valor, 4400);
    assert.equal(comprometido.teto, 5000);
    assert.equal(comprometido.percentualFaturamento, 44);
    assert.equal(comprometido.percentualDoTeto, 88);
    assert.equal(comprometido.excedido, false);
});

test('sem faturamento o limite permanece zerado', () => {
    const d = contexto.calcular([{ nome: 'Conta', categ: 'Comprometido', v: -200 }]);
    assert.equal(d.faturamento, 0);
    assert.equal(d.limites[0].valor, 200);
    assert.equal(d.limites[0].teto, 0);
    assert.equal(d.limites[0].excedido, true);
});
