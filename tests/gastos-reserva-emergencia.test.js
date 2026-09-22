const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('script.js', 'utf8');
const inicio = script.indexOf('function resumoGastosReservaEmergencia(');
const fim = script.indexOf('\nfunction dadosDoGraficoReservaEmergenciaCiclo(', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou o resumo de gastos de reserva emergência no script.');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
const resumir = linhas => ({ ...contexto.resumoGastosReservaEmergencia(linhas) });

test('separa todos os gastos negativos entre reserva emergência e sem reserva', () => {
    assert.deepEqual(
        resumir([
            { v: -120, reserva_emergencia: true },
            { v: -80, reserva_emergencia: false },
            { v: -40, reserva_emergencia: null },
            { v: 500, reserva_emergencia: true },
        ]),
        { reservaEmergencia: 120, semReservaEmergencia: 120 }
    );
});

test('não considera transferências de fatura como gasto do ciclo', () => {
    assert.deepEqual(
        resumir([
            { v: -300, reserva_emergencia: true, _transferencia: true },
            { v: -75, reserva_emergencia: true },
        ]),
        { reservaEmergencia: 75, semReservaEmergencia: 0 }
    );
});
