// Filtros de tabela avaliados com controles simulados, sem renderizar ou alterar dados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/tables.js', 'utf8');
const fim = fonte.indexOf('\n// ORDENAÇÃO', 0);
if (fim < 0) throw Error('Não encontrou os filtros de tabela.');

function filtros(valores) {
    const contexto = {
        Estado: { lancamentos: [] },
        el: id => ({ value: valores[id] }),
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(0, fim)}\nglobalThis.regras = { passaFiltroTriEstado, filtrarLancamentos };`, contexto);
    return contexto;
}

const linhas = [
    { id: 1, ativo: true, pago: true, cred: false, isa: false, v: -50 },
    { id: 2, ativo: true, pago: false, cred: true, isa: true, v: -80 },
    { id: 3, ativo: false, pago: true, cred: false, isa: true, v: 100 },
    { id: 4, ativo: true, pago: true, cred: false, isa: false, v: 0 },
];

test('filtro de três estados aceita ambos, sim e não', () => {
    for (const [valor, esperado] of [['B', true], ['S', true], ['N', false]]) {
        const c = filtros({ fativo: valor });
        assert.equal(c.regras.passaFiltroTriEstado('fativo', true), esperado);
    }
});

test('filtra origem, titular e ativo de forma combinada', () => {
    const c = filtros({ fativo: 'S', fpago: 'B', origem: 'D', titular: 'E', fvalor: 'T' });
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [1, 4]);
});

test('filtro de pago encontra somente crédito aberto da Isabella', () => {
    const c = filtros({ fativo: 'S', fpago: 'N', origem: 'F', titular: 'I', fvalor: 'N' });
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [2]);
});

test('filtro de sinal não deixa lançamento zero passar como entrada ou saída', () => {
    const positivos = filtros({ fativo: 'B', fpago: 'B', origem: 'A', titular: 'T', fvalor: 'P' });
    positivos.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(positivos.regras.filtrarLancamentos()).map(x => x.id), [3]);

    const negativos = filtros({ fativo: 'B', fpago: 'B', origem: 'A', titular: 'T', fvalor: 'N' });
    negativos.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(negativos.regras.filtrarLancamentos()).map(x => x.id), [1, 2]);
});
