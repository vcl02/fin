// Regressão da comparação: Reserva é marca da meta e não cria categoria financeira na matriz.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/cycle-views.js', 'utf8');
const inicio = fonte.indexOf('function categoriaDaComparacao(');
const fim = fonte.indexOf('function vComp()', inicio);
const codigo = fonte.slice(inicio, fim);

function categoriaDaComparacao(categ) {
    const normalizar = valor => String(valor ?? '').trim().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const contexto = {
        categoriasSeparadas: valor => String(valor ?? '').split(',').map(c => c.trim()).filter(Boolean),
        ehCategoria: (valor, procurada) => normalizar(valor) === normalizar(procurada),
        textoOuTraco: valor => String(valor || '-'),
    };
    vm.runInNewContext(`${codigo}; this.categoriaDaComparacao = categoriaDaComparacao;`, contexto);
    return contexto.categoriaDaComparacao(categ);
}

test('comparar remove Reserva de categoria compartilhada e ignora Reserva isolada', () => {
    assert.equal(categoriaDaComparacao('Casa, Reserva'), 'Casa');
    assert.equal(categoriaDaComparacao('Reserva, Saúde'), 'Saúde');
    assert.equal(categoriaDaComparacao('Reserva'), '');
    assert.equal(categoriaDaComparacao(null), '-');
});
