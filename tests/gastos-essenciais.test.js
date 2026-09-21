const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('script.js', 'utf8');
const inicio = script.indexOf('function resumoGastosEssenciais(');
const fim = script.indexOf('\nfunction dadosDoGraficoEssencialCiclo(', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou o resumo de gastos essenciais no script.');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
const resumir = linhas => ({ ...contexto.resumoGastosEssenciais(linhas) });

test('separa todos os gastos negativos entre essencial e não essencial', () => {
    assert.deepEqual(
        resumir([
            { v: -120, essencial: true },
            { v: -80, essencial: false },
            { v: -40, essencial: null },
            { v: 500, essencial: true },
        ]),
        { essencial: 120, naoEssencial: 120 }
    );
});

test('não considera transferências de fatura como gasto do ciclo', () => {
    assert.deepEqual(
        resumir([
            { v: -300, essencial: true, _transferencia: true },
            { v: -75, essencial: true },
        ]),
        { essencial: 75, naoEssencial: 0 }
    );
});
