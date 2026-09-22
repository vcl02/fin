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
const calcular = (linhas, idx, guardado) => ({ ...contexto.dadosMetaReservaEmergencia(linhas, idx, guardado) });

test('soma nove ciclos previstos e acompanha o aumento da Evolução Obra', () => {
    const d = calcular([
        { periodoIdx: 4, nome: 'Condomínio', v: -100, reserva_emergencia: true },
        { periodoIdx: 4, nome: 'Evolução Obra', v: -200, reserva_emergencia: true },
        { periodoIdx: 5, nome: 'Evolução Obra', v: -300, reserva_emergencia: true },
        { periodoIdx: 6, nome: 'Evolução Obra', v: -400, reserva_emergencia: true },
        { periodoIdx: 5, nome: 'Outros', v: -700, reserva_emergencia: false },
        { periodoIdx: 5, nome: 'Antecipação', v: -800, reserva_emergencia: true, _transferencia: true },
        { periodoIdx: 5, nome: 'Estorno', v: 50, reserva_emergencia: true },
    ], 4, 450);
    assert.equal(d.gastoMensal, 300);
    assert.equal(d.meta, 4200); // 300 + 400 + sete ciclos de 500
    assert.equal(d.guardado, 450);
    assert.equal(d.restante, 3750);
    assert.equal(d.mesesComEstimativa, 8);
});

test('gasto que começa no futuro entra na meta e valor sem ocorrência é mantido', () => {
    const d = calcular([
        { periodoIdx: 2, nome: 'Casa', v: -100, reserva_emergencia: true },
        { periodoIdx: 3, nome: 'Seguro', v: -50, reserva_emergencia: true },
    ], 2, 0);
    assert.equal(d.meta, 100 + 8 * 150);
    assert.equal(d.mesesComEstimativa, 8);
});

test('progresso fica limitado a cem por cento e mostra excedente', () => {
    const d = calcular([{ periodoIdx: 1, nome: 'Casa', v: -100, reserva_emergencia: true }], 1, 1200);
    assert.equal(d.meta, 900);
    assert.equal(d.percentual, 100);
    assert.equal(d.guardadoNaMeta, 900);
    assert.equal(d.excedente, 300);
});
