const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('script.js', 'utf8');
const inicio = script.indexOf('function faturasSugeridasParaParcelas(');
const fim = script.indexOf('\n// Credito nao tem mais inferencia por fechamento', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de sugestão de faturas no script.');

const contexto = {
    dataISO: valor => String(valor).slice(0, 10),
    timestamp: valor => Date.parse(`${valor}T00:00:00Z`),
    dataDaOcorrencia: (data, parcela, frequencia) => {
        const d = new Date(`${data}T00:00:00Z`);
        if (frequencia !== 'Mensal') throw Error('O teste cobre prestações mensais.');
        d.setUTCMonth(d.getUTCMonth() + parcela);
        return d.toISOString().slice(0, 10);
    },
};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);

const faturas = ['2026-10-10', '2026-11-10', '2026-12-10']
    .map(vencimento => ({ vencimento }));
const sugerir = (...args) => Array.from(contexto.faturasSugeridasParaParcelas(...args));

test('sugere uma fatura para cada prestação mensal simulada', () => {
    assert.deepEqual(
        sugerir(faturas, '2026-09-21', 3, 'Mensal'),
        ['2026-10-10', '2026-11-10', '2026-12-10']
    );
});

test('mantém a última fatura como sugestão quando a prestação excede as conhecidas', () => {
    assert.deepEqual(
        sugerir(faturas, '2027-01-01', 2, 'Mensal'),
        ['2026-12-10', '2026-12-10']
    );
});

test('não sugere fatura quando ainda não há nenhuma disponível', () => {
    assert.deepEqual(
        sugerir([], '2026-09-21', 2, 'Mensal'),
        [null, null]
    );
});

test('usa a sugestão também no cadastro real, sem depender da simulação', () => {
    assert.match(script, /const sugestoes = cred\s*\?/);
    assert.doesNotMatch(script, /Estado\.simulando && cred/);
});
