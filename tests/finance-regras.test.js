// Regras puras de saldo, aporte/resgate e prévia de Crédito executadas sem banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/finance.js', 'utf8');
const inicio = fonte.indexOf('function totalBaseDoCiclo(');
const fim = fonte.indexOf('\n// Linha sintetica de Resgate', inicio);
const trechoCredito = fonte.slice(fonte.indexOf('function creditosExibidosNoCiclo('));
if (inicio < 0 || fim < 0) throw Error('Não encontrou as regras centrais de saldo.');

function regrasFinanceiras(ciclos) {
    const contexto = {
        Estado: { ciclos }, SALDO_DESDE: '2026-01-01',
        CATEGORIA_INVESTIMENTO: 'Investimento', LIMITE_CARTAO: 3750, TOLERANCIA_FINANCEIRA: 0.005,
        dataISO: valor => String(valor).slice(0, 10),
        hojeISO: () => '2026-09-26',
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\n${fonte.slice(fonte.indexOf('function ajusteInvestimento('), fonte.indexOf('\n// Total do bloco Debito', fonte.indexOf('function ajusteInvestimento(')))}\n${trechoCredito}\nglobalThis.regras = { totalBaseDoCiclo, ajusteInvestimento, creditosExibidosNoCiclo, totalCreditoExibidoAposAntecipacoes, lancamentosPagosAte, resumoDebitoPagoAte, guardadoGarantidoAte, limiteCartaoOcupado, limiteCartaoTotal, limiteCartaoLivre };`, contexto);
    return contexto.regras;
}

test('aporte sugerido absorve somente saldo positivo acima da tolerância', () => {
    const r = regrasFinanceiras([{ fat: '2026-09-30' }]);
    assert.deepEqual({ ...r.ajusteInvestimento(300) }, { tipo: 'aporte', nome: 'Aporte sugerido', categ: 'Investimento', v: -300 });
    assert.equal(r.ajusteInvestimento(0.005), null);
    assert.equal(r.ajusteInvestimento(-0.005), null);
});

test('resgate necessário respeita o patrimônio disponível', () => {
    const r = regrasFinanceiras([{ fat: '2026-09-30' }]);
    assert.deepEqual({ ...r.ajusteInvestimento(-300, 120) }, { tipo: 'resgate', nome: 'Resgate necessário', categ: 'Investimento', v: 120 });
    assert.equal(r.ajusteInvestimento(-300, 0), null);
    assert.equal(r.ajusteInvestimento(-300, -20), null);
});

test('saldo base carrega o anterior, débito e fatura líquida de antecipação', () => {
    const r = regrasFinanceiras([{ fat: '2026-09-30' }, { fat: '2026-10-31' }]);
    const base = [
        { periodoIdx: 1, cred: false, v: 50 },
        { periodoIdx: 1, cred: true, v: -200 },
    ];
    assert.equal(r.totalBaseDoCiclo(1, base, { 1: 80 }, () => 30), -40);
});

test('saldo base não usa ciclos anteriores ao marco de saldo', () => {
    const r = regrasFinanceiras([{ fat: '2025-12-31' }]);
    assert.equal(r.totalBaseDoCiclo(0, [{ periodoIdx: 0, cred: false, v: 999 }], {}, () => 0), 0);
    assert.equal(r.totalBaseDoCiclo(-1, [], {}, () => 0), 0);
});

test('crédito é visualmente deslocado, mas o total respeita antecipação', () => {
    const r = regrasFinanceiras([{ fat: '2026-09-30' }, { fat: '2026-10-31' }]);
    const linhas = [{ id: 1, cred: true, periodoIdx: 0, v: -90 }, { id: 2, cred: true, periodoIdx: 1, v: -120 }];
    assert.deepEqual(Array.from(r.creditosExibidosNoCiclo(linhas, 0)).map(x => x.id), [2]);
    assert.equal(r.totalCreditoExibidoAposAntecipacoes([{ v: -120 }, { v: -30 }], 70), -80);
    assert.equal(r.totalCreditoExibidoAposAntecipacoes([], 0), 0);
});

test('resumo de hoje ignora abertos e datas futuras, mas separa saldo de guardado', () => {
    const r = regrasFinanceiras([]);
    const linhas = [
        { data: '2026-09-20', pago: true, cred: false, v: 1000 },
        { data: '2026-09-21', pago: true, cred: false, inv: true, v: -560 },
        { data: '2026-09-22', pago: false, cred: false, v: -200 },
        { data: '2026-09-27', pago: true, cred: false, v: -300 },
        { data: '2026-09-23', pago: true, cred: true, v: -90 },
    ];
    assert.deepEqual(Array.from(r.lancamentosPagosAte(linhas, '2026-09-26')).map(linha => linha.v), [1000, -560, -90]);
    assert.deepEqual({ ...r.resumoDebitoPagoAte(linhas, '2026-09-26') }, { saldo: 440, guardado: 560 });
});

test('limite considera só crédito confirmado, antecipação e garantia positiva do ciclo', () => {
    const r = regrasFinanceiras([]);
    const linhas = [
        { cred: true, pago: false, periodoIdx: 0, v: -500 }, // projeção: não ocupa
        { cred: true, pago: true, periodoIdx: 0, v: -300 },
        { cred: true, pago: true, periodoIdx: 1, v: -450 },
    ];
    const abatido = { 0: 100, 1: 450 };
    assert.equal(r.limiteCartaoOcupado(linhas, abatido), 200);
    assert.equal(r.limiteCartaoLivre(linhas, abatido), 3550);
    assert.equal(r.limiteCartaoTotal(600), 4350);
    assert.equal(r.limiteCartaoLivre(linhas, abatido, 600), 4150);
    assert.equal(r.limiteCartaoTotal(-600), 3750);
});

test('garantia Nubank ignora filtro Pago e não inclui aporte sugerido', () => {
    const r = regrasFinanceiras([]);
    const linhas = [
        { inv: true, pago: true, periodoIdx: 0, v: -300 },
        { inv: true, pago: false, periodoIdx: 1, v: -500 }, // aberto ainda está na garantia
        { inv: true, pago: true, periodoIdx: 1, v: 100 },    // resgate reduz a garantia
        { inv: true, pago: true, periodoIdx: 2, v: -900 },   // ciclo futuro não entra
        { inv: false, periodoIdx: 1, v: -800 },               // sugestão não é aporte real
    ];
    assert.equal(r.guardadoGarantidoAte(linhas, 1), 700);
    assert.equal(r.limiteCartaoTotal(r.guardadoGarantidoAte(linhas, 1)), 4450);
});
