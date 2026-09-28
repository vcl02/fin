// Regressão da comparação: Reserva é marca da meta e não cria categoria financeira na matriz.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/cycle-views.js', 'utf8');
const inicio = fonte.indexOf('function categoriaDaComparacao(');
const fim = fonte.indexOf('function vComp()', inicio);
const codigo = fonte.slice(inicio, fim);

function regrasDaComparacao() {
    const normalizar = valor => String(valor ?? '').trim().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const contexto = {
        categoriasSeparadas: valor => String(valor ?? '').split(',').map(c => c.trim()).filter(Boolean),
        ehCategoria: (valor, procurada) => normalizar(valor) === normalizar(procurada),
        textoOuTraco: valor => String(valor || '-'),
    };
    vm.runInNewContext(`${codigo}; this.regras = { categoriaDaComparacao, estadoDaComparacaoPorCiclos };`, contexto);
    return contexto.regras;
}

test('comparar remove Reserva de categoria compartilhada e ignora Reserva isolada', () => {
    const regras = regrasDaComparacao();
    assert.equal(regras.categoriaDaComparacao('Casa, Reserva'), 'Casa');
    assert.equal(regras.categoriaDaComparacao('Reserva, Saúde'), 'Saúde');
    assert.equal(regras.categoriaDaComparacao('Reserva'), '');
    assert.equal(regras.categoriaDaComparacao(null), '-');
});

test('confirma acabou, começou e único somente com dois ciclos futuros', () => {
    const { estadoDaComparacaoPorCiclos } = regrasDaComparacao();
    const estado = (...args) => JSON.parse(JSON.stringify(estadoDaComparacaoPorCiclos(...args)));
    assert.deepEqual(
        estado(new Set([0]), 0, 1, 4),
        { acabou: true, comecou: false, unico: false },
    );
    assert.deepEqual(
        estado(new Set([1, 2, 3]), 0, 1, 4),
        { acabou: false, comecou: true, unico: false },
    );
    assert.deepEqual(
        estado(new Set([1]), 0, 1, 4),
        { acabou: false, comecou: false, unico: true },
    );
    assert.deepEqual(
        estado(new Set([0]), 0, 1, 3),
        { acabou: false, comecou: false, unico: false },
    );
});
