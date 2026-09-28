// Regressão da lista de Visualizações: apenas relações com saldo aberto ficam disponíveis.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const graficos = fs.readFileSync('js/charts.js', 'utf8');
const inicio = graficos.indexOf('function dadosVisualizacao(');
const fim = graficos.indexOf('function popularAlvosVisualizacao(', inicio);
const codigo = graficos.slice(inicio, fim);

function criarFuncoesVisualizacao(lancamentos) {
    const normalizar = valor => String(valor ?? '').trim().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const categoriasSeparadas = valor => String(valor ?? '').split(',')
        .map(categoria => categoria.trim()).filter(Boolean);
    const contexto = {
        Estado: { lancamentos },
        categoriasSeparadas,
        ehCategoria: (valor, procurada) => categoriasSeparadas(valor)
            .some(categoria => normalizar(categoria) === normalizar(procurada)),
    };
    vm.runInNewContext(`${codigo}; this.valoresDaVisualizacao = valoresDaVisualizacao;`, contexto);
    return contexto.valoresDaVisualizacao;
}

test('oculta categoria ou nome integralmente quitado e mantém alvos com saldo aberto', () => {
    const valoresDaVisualizacao = criarFuncoesVisualizacao([
        { nome: 'Almoço', categ: 'Alimentação', pago: true, v: -40 },
        { nome: 'Antecipação Fatura', categ: 'Antecipação Fatura', pago: true, v: -80 },
        { nome: 'Academia', categ: 'Saúde', pago: false, v: -100 },
        { nome: 'Mercado', categ: 'Alimentação', pago: false, v: -25 },
    ]);

    assert.deepEqual([...valoresDaVisualizacao('categ')], ['Alimentação', 'Saúde']);
    assert.deepEqual([...valoresDaVisualizacao('nome')], ['Academia', 'Mercado']);
});

test('valor aberto de meio centavo ou menos não mantém alvo quitado no seletor', () => {
    const valoresDaVisualizacao = criarFuncoesVisualizacao([
        { nome: 'Ajuste mínimo', categ: 'Ajuste', pago: false, v: -0.005 },
    ]);

    assert.deepEqual([...valoresDaVisualizacao('categ')], []);
    assert.deepEqual([...valoresDaVisualizacao('nome')], []);
});
