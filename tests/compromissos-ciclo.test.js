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
vm.runInContext(`${fonte.slice(inicio, fim)}; globalThis.regras = {
    calcular: dadosCompromissosDoCiclo,
    classeReserva: classeIndicadorReserva,
    classeComprometido: classeIndicadorComprometido,
    variacao: variacaoPercentualIndicador,
};`, contexto);

test('Comprometido usa crédito e débito contra 50% do faturamento do ciclo', () => {
    const d = contexto.regras.calcular([
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
    const d = contexto.regras.calcular([{ nome: 'Conta', categ: 'Comprometido', v: -200 }]);
    assert.equal(d.faturamento, 0);
    assert.equal(d.limites[0].valor, 200);
    assert.equal(d.limites[0].teto, 0);
    assert.equal(d.limites[0].excedido, true);
});

test('indicadores usam faixas verde, âmbar e vermelha conforme suas regras', () => {
    assert.equal(contexto.regras.classeReserva({ meta: 900, percentual: 40 }), 'vm');
    assert.equal(contexto.regras.classeReserva({ meta: 900, percentual: 50 }), 'am');
    assert.equal(contexto.regras.classeReserva({ meta: 900, percentual: 100 }), 'vd');
    assert.equal(contexto.regras.classeComprometido({
        faturamento: 1000, limites: [{ percentualFaturamento: 40, percentual: 50 }],
    }), 'vd');
    assert.equal(contexto.regras.classeComprometido({
        faturamento: 1000, limites: [{ percentualFaturamento: 45, percentual: 50 }],
    }), 'am');
    assert.equal(contexto.regras.classeComprometido({
        faturamento: 1000, limites: [{ percentualFaturamento: 51, percentual: 50 }],
    }), 'vm');
});

test('variação usa sentidos opostos para Reserva e Comprometido', () => {
    assert.deepEqual({ ...contexto.regras.variacao(12.34, 10.01, true) }, {
        diferenca: 2.3, seta: '↑', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacao(42.04, 45.02, false) }, {
        diferenca: 3, seta: '↓', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacao(50.01, 50.04, false) }, {
        diferenca: 0, seta: '→', classe: 'neutro',
    });
    assert.equal(contexto.regras.variacao(NaN, 20, true), null);
});
