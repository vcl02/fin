// Regra de orçamento: Comprometido usa o Faturamento PJ do próprio ciclo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const regrasMd = fs.readFileSync('docs/REGRAS.md', 'utf8');
const inicio = fonte.indexOf('const LIMITES_COMPROMISSOS =');
const fim = fonte.indexOf('\nfunction dadosDoGraficoCiclo(', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou o cálculo de compromissos do ciclo.');

// alocacaoAntecipacoes real tem seus pr\u00f3prios testes (tests/shared-regras.test.js); aqui
// \u00e9 um stub controlado s\u00f3 pra verificar que dadosCompromissosCiclo soma o abatimento que
// recebe, sem reimplementar a aloca\u00e7\u00e3o de verdade.
const abatidoPorCiclo = {};
const contexto = {
    NOME_ANCORA_CICLO: 'Faturamento PJ', TOLERANCIA_FINANCEIRA: 0.005,
    semAcento: valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    MESES_MEDIA_LIBERDADE_FINANCEIRA: 12,
    TAXA_RETIRADA_LIBERDADE_FINANCEIRA: 0.035,
    ehCategoria: (categ, procurada) => String(categ || '').split(',')
        .some(categoria => categoria.trim().toLowerCase() == procurada.toLowerCase()),
    ehTransferenciaFatura: r => !r.cred && /antecipa[c\u00e7][a\u00e3]o/i.test(`${r.nome || ''} ${r.categ || ''}`),
    alocacaoAntecipacoes: () => abatidoPorCiclo,
    Estado: { ciclos: [], lancamentos: [] },
};
vm.createContext(contexto);
vm.runInContext(`${fonte.slice(inicio, fim)}; globalThis.regras = {
    calcular: dadosCompromissosDoCiclo,
    calcularCiclo: dadosCompromissosCiclo,
    proporcaoReserva: dadosProporcaoReservaDoCiclo,
    liberdade: dadosLiberdadeFinanceira,
    classeReserva: classeIndicadorReserva,
    classeComprometido: classeIndicadorComprometido,
    classeProporcaoReserva: classeIndicadorProporcaoReserva,
    variacao: variacaoPercentualIndicador,
    variacaoValor: variacaoValorIndicador,
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

test('dadosCompromissosCiclo soma a fatura líquida do cartão como Comprometido, mesmo sem a linha existir em Estado.lancamentos', () => {
    abatidoPorCiclo[0] = 200;   // antecipação já abateu parte da fatura deste ciclo
    contexto.Estado.ciclos = [{ fat: '2026-10-31' }];
    contexto.Estado.lancamentos = [
        { nome: 'Faturamento PJ', categ: 'Évora', v: 10000, periodoIdx: 0, cred: false },
        { nome: 'Curso', categ: 'Casa, Comprometido', v: -900, cred: true, periodoIdx: 0 },
        { nome: 'Compra cartão', categ: 'Lazer', v: -500, cred: true, periodoIdx: 0 },   // -500, abatido 200 -> -300 líquido
    ];
    const d = contexto.regras.calcularCiclo(0);
    const [comprometido] = d.limites;
    // 900 (Curso, já tinha Comprometido) + 300 (fatura líquida, sintética) = 1200
    assert.equal(comprometido.valor, 1200);
    delete abatidoPorCiclo[0];
});

test('compra no cartão já marcada Comprometido pelo usuário nunca é contada duas vezes', () => {
    // Cenário real confirmado nos dados: "Pós" é uma parcela de curso no cartão, já com
    // "Comprometido" na própria categoria. Sem a exclusão, a fatura sintética somaria essa
    // mesma parcela de novo por cima do valor real.
    contexto.Estado.ciclos = [{ fat: '2026-10-31' }];
    contexto.Estado.lancamentos = [
        { nome: 'Faturamento PJ', categ: 'Évora', v: 10000, periodoIdx: 0, cred: false },
        { nome: 'Pós', categ: 'Educação, Reserva, Comprometido', v: -500, cred: true, periodoIdx: 0 },
    ];
    const d = contexto.regras.calcularCiclo(0);
    assert.equal(d.limites[0].valor, 500);   // não 1000 (500 real + 500 duplicado pela fatura)
});

test('fatura já quitada (líquido ~0) não soma nada ao Comprometido', () => {
    abatidoPorCiclo[0] = 500;   // abatimento exatamente igual à compra: nada sobra a pagar
    contexto.Estado.ciclos = [{ fat: '2026-10-31' }];
    contexto.Estado.lancamentos = [
        { nome: 'Faturamento PJ', categ: 'Évora', v: 10000, periodoIdx: 0, cred: false },
        { nome: 'Compra cartão', categ: 'Lazer', v: -500, cred: true, periodoIdx: 0 },
    ];
    const d = contexto.regras.calcularCiclo(0);
    assert.equal(d.limites[0].valor, 0);
    delete abatidoPorCiclo[0];
});

test('sem nenhuma compra no cartão no ciclo, fatura líquida é zero e não soma nada', () => {
    contexto.Estado.ciclos = [{ fat: '2026-10-31' }];
    contexto.Estado.lancamentos = [
        { nome: 'Faturamento PJ', categ: 'Évora', v: 10000, periodoIdx: 0, cred: false },
        { nome: 'Aluguel', categ: 'Comprometido', v: -3500, cred: false, periodoIdx: 0 },
    ];
    const d = contexto.regras.calcularCiclo(0);
    assert.equal(d.limites[0].valor, 3500);
});

test('sem faturamento o limite permanece zerado', () => {
    const d = contexto.regras.calcular([{ nome: 'Conta', categ: 'Comprometido', v: -200 }]);
    assert.equal(d.faturamento, 0);
    assert.equal(d.limites[0].valor, 200);
    assert.equal(d.limites[0].teto, 0);
    assert.equal(d.limites[0].excedido, true);
});

test('proporção de Reserva separa o gasto inteiro dos demais sem duplicar categoria composta', () => {
    const d = contexto.regras.proporcaoReserva([
        { nome: 'Casa', categ: 'Casa, Reserva', v: -300, cred: false },
        { nome: 'Mercado', categ: 'Alimentação', v: -500, cred: false },
        { nome: 'Compra', categ: 'Reserva', v: -200, cred: true },
        { nome: 'Antecipação', categ: 'Reserva', v: -100, _transferencia: true },
    ]);
    assert.deepEqual({ ...d }, {
        total: 1000, reserva: 500, demais: 500,
        percentualReserva: 50, percentualDemais: 50,
    });
});

test('liberdade usa média de gastos, taxa de 3,5% e só capital acima da reserva', () => {
    const d = contexto.regras.liberdade([
        { periodoIdx: 0, categ: 'Casa', v: -1000 },
        { periodoIdx: 1, categ: 'Lazer', v: -2000 },
        { periodoIdx: 1, categ: 'Investimento', inv: true, v: -900 },
        { periodoIdx: 1, categ: 'Reembolso', v: -100 },
        { periodoIdx: 1, categ: 'Casa', v: -300, _transferencia: true },
    ], 1, 10000, 3000);
    assert.equal(d.mesesObservados, 2);
    assert.equal(d.gastoMensal, 1500);
    assert.equal(d.meta, 1500 * 12 / 0.035);
    assert.equal(d.patrimonioLivre, 7000);
    assert.equal(d.percentual, 7000 / d.meta * 100);
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
    assert.equal(contexto.regras.classeProporcaoReserva({ total: 1000, percentualReserva: 40 }), 'vd');
    assert.equal(contexto.regras.classeProporcaoReserva({ total: 1000, percentualReserva: 45 }), 'am');
    assert.equal(contexto.regras.classeProporcaoReserva({ total: 1000, percentualReserva: 51 }), 'vm');
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

test('variação em reais usa Guardado ou valor comprometido sem perder os centavos', () => {
    assert.deepEqual({ ...contexto.regras.variacaoValor(620, 500, true) }, {
        diferenca: 120, seta: '↑', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacaoValor(900, 1000, false) }, {
        diferenca: 100, seta: '↓', classe: 'vd',
    });
    assert.deepEqual({ ...contexto.regras.variacaoValor(100, 100.004, false) }, {
        diferenca: 0, seta: '→', classe: 'neutro',
    });
});

test('linha sintética "Fatura do cartão" do bloco Débito carrega a categoria Comprometido também', () => {
    assert.match(visoes, /nome: 'Fatura do cartão', categ: 'Fatura, Comprometido',/);
});

test('fatura do cartão como Comprometido, sem contar duas vezes, documentada em REGRAS.md', () => {
    assert.match(regrasMd, /A fatura do cartão do próprio ciclo também conta: a linha sintética `Fatura do cartão`/);
    assert.match(regrasMd, /carrega a categoria `Fatura, Comprometido`/);
    assert.match(regrasMd, /nunca é somada duas vezes: ela já entra pela soma normal de linhas reais/);
});
