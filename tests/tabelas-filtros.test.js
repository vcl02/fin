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
        ehCategoria: (categ, procurada) => String(categ || '').split(',')
            .some(categoria => categoria.trim().toLowerCase() === procurada.toLowerCase()),
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(0, fim)}\nglobalThis.regras = { passaFiltroTriEstado, filtrarLancamentos };`, contexto);
    return contexto;
}

const linhas = [
    { id: 1, pago: true, cred: false, categ: 'Casa', v: -50 },
    { id: 2, pago: false, cred: true, categ: 'Casa, Isabella', v: -80 },
    { id: 3, pago: true, cred: false, categ: 'Isabella', v: 100 },
    { id: 4, pago: true, cred: false, categ: 'Casa', v: 0 },
];

test('filtro de três estados aceita ambos, sim e não', () => {
    for (const [valor, esperado] of [['B', true], ['S', true], ['N', false]]) {
        const c = filtros({ fpago: valor });
        assert.equal(c.regras.passaFiltroTriEstado('fpago', true), esperado);
    }
});

test('filtra origem e titular por categoria de forma combinada', () => {
    const c = filtros({ fpago: 'B', origem: 'D', titular: 'E', fvalor: 'T' });
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [1, 4]);
});

test('filtro de pago encontra somente crédito aberto da Isabella', () => {
    const c = filtros({ fpago: 'N', origem: 'F', titular: 'I', fvalor: 'N' });
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [2]);
});

test('filtro de sinal não deixa lançamento zero passar como entrada ou saída', () => {
    const positivos = filtros({ fpago: 'B', origem: 'A', titular: 'T', fvalor: 'P' });
    positivos.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(positivos.regras.filtrarLancamentos()).map(x => x.id), [3]);

    const negativos = filtros({ fpago: 'B', origem: 'A', titular: 'T', fvalor: 'N' });
    negativos.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(negativos.regras.filtrarLancamentos()).map(x => x.id), [1, 2]);
});
