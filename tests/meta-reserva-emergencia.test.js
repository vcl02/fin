const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('script.js', 'utf8');
const inicio = script.indexOf('const MESES_META_RESERVA_EMERGENCIA = 9;');
const fim = script.indexOf('\nfunction dadosMetaReservaEmergenciaCiclo(', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou o cálculo da meta de reserva emergência.');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
vm.runInContext('this.mesesMeta = MESES_META_RESERVA_EMERGENCIA;', contexto);

test('meta considera somente gastos negativos marcados e ignora transferência', () => {
    const d = contexto.dadosMetaReservaEmergencia([
        { v: -100, reserva_emergencia: true },
        { v: -70, reserva_emergencia: false },
        { v: 300, reserva_emergencia: true },
        { v: -80, reserva_emergencia: true, _transferencia: true },
    ], 450);
    assert.deepEqual({ ...d }, {
        gastoMensal: 100, meta: 900, guardado: 450, guardadoNaMeta: 450,
        restante: 450, excedente: 0, percentual: 50,
    });
});

test('constante da meta é nove meses', () => {
    assert.equal(contexto.mesesMeta, 9);
});
