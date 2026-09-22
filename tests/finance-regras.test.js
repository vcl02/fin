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
        CATEGORIA_INVESTIMENTO: 'Investimento', TOLERANCIA_FINANCEIRA: 0.005,
        dataISO: valor => String(valor).slice(0, 10),
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\n${fonte.slice(fonte.indexOf('function ajusteInvestimento('), fonte.indexOf('\n// Total do bloco Debito', fonte.indexOf('function ajusteInvestimento(')))}\n${trechoCredito}\nglobalThis.regras = { totalBaseDoCiclo, ajusteInvestimento, creditosExibidosNoCiclo, totalCreditoExibidoAposAntecipacoes };`, contexto);
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
