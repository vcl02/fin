// Recorte comum das tabelas avaliado sem renderizar ou alterar dados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/tables.js', 'utf8');
const fim = fonte.indexOf('\n// ORDENAÇÃO', 0);
if (fim < 0) throw Error('Não encontrou os filtros de tabela.');

function filtros() {
    const contexto = {
        Estado: { lancamentos: [] },
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(0, fim)}\nglobalThis.regras = { filtrarLancamentos };`, contexto);
    return contexto;
}

const linhas = [
    { id: 1, pago: true, cred: false, categ: 'Casa', v: -50 },
    { id: 2, pago: false, cred: true, categ: 'Casa, Isabella', v: -80 },
    { id: 3, pago: true, cred: false, categ: 'Isabella', v: 100 },
    { id: 4, pago: true, cred: false, categ: 'Casa', v: 0 },
];

test('não aplica filtro global de pago nem origem', () => {
    const c = filtros();
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [1, 2, 3, 4]);
    assert.doesNotMatch(fonte, /fpago|origem|passaFiltroTriEstado/);
});

test('não há mais filtro de titular nem de sinal', () => {
    assert.doesNotMatch(fonte, /el\('titular'\)|el\('fvalor'\)/);
});
