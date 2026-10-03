// Regra de orçamento: limites de Parcelado e Fixo usam o Faturamento PJ do próprio ciclo.
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

test('Parcelado e Fixo usam crédito e débito contra o faturamento do ciclo', () => {
    const d = contexto.calcular([
        { nome: 'Faturamento PJ', categ: 'Évora', v: 10000 },
        { nome: 'Curso', categ: 'Casa, Parcelado', v: -900, cred: true },
        { nome: 'Aluguel', categ: 'Fixo', v: -3500, cred: false },
        { nome: 'Plano', categ: 'Fixo, Parcelado', v: -200, cred: false },
        { nome: 'Antecipação', categ: 'Parcelado', v: -700, _transferencia: true },
    ]);
    const [parcelado, fixo] = d.limites;
    assert.equal(d.faturamento, 10000);
    assert.equal(parcelado.valor, 1100);
    assert.equal(parcelado.teto, 1000);
    assert.equal(parcelado.percentualFaturamento, 11);
    assert.ok(Math.abs(parcelado.percentualDoTeto - 110) < 0.000001);
    assert.equal(parcelado.excedido, true);
    assert.equal(fixo.valor, 3700);
    assert.equal(fixo.teto, 4000);
    assert.equal(fixo.excedido, false);
});

test('sem faturamento o limite permanece zerado', () => {
    const d = contexto.calcular([{ nome: 'Conta', categ: 'Fíxo', v: -200 }]);
    assert.equal(d.faturamento, 0);
    assert.equal(d.limites[1].valor, 200);
    assert.equal(d.limites[1].teto, 0);
    assert.equal(d.limites[1].excedido, true);
});
