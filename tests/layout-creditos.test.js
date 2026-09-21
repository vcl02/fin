const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('script.js', 'utf8');
const inicio = script.indexOf('function creditosExibidosNoCiclo(');
const fim = script.indexOf('\nfunction vCiclo()', inicio);

if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de layout do Crédito no script.');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
const exibir = (linhas, ciclo) => Array.from(contexto.creditosExibidosNoCiclo(linhas, ciclo));

test('mostra no ciclo atual somente os créditos que pertencem ao ciclo seguinte', () => {
    const linhas = [
        { id: 1, cred: true, periodoIdx: 4 },
        { id: 2, cred: true, periodoIdx: 5 },
        { id: 3, cred: false, periodoIdx: 5 },
    ];
    assert.deepEqual(exibir(linhas, 4).map(r => r.id), [2]);
});

test('não desloca créditos quando não existe uma competência seguinte', () => {
    assert.deepEqual(exibir([{ id: 1, cred: true, periodoIdx: 4 }], 4), []);
});
