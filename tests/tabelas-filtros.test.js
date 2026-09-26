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

test('filtra lançamentos por origem', () => {
    const c = filtros({ fpago: 'B', origem: 'D' });
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [1, 3, 4]);
});

test('filtro de pago encontra somente crédito aberto', () => {
    const c = filtros({ fpago: 'N', origem: 'F' });
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [2]);
});

test('não há mais filtro de titular nem de sinal', () => {
    assert.doesNotMatch(fonte, /el\('titular'\)|el\('fvalor'\)/);
});
