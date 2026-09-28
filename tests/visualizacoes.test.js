// Regressão das Visualizações fixas e de suas correspondências por nome/categoria.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const graficos = fs.readFileSync('js/charts.js', 'utf8');
const inicio = graficos.indexOf('const NOMES_DAS_VISUALIZACOES =');
const fim = graficos.indexOf('function popularAlvosVisualizacao(', inicio);
const codigo = graficos.slice(inicio, fim);

function criarVisualizacoes(lancamentos) {
    const contexto = {
        Estado: { lancamentos },
        semAcento: valor => String(valor ?? '').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    };
    vm.runInNewContext(`${codigo}; this.testadas = { OPCOES_VISUALIZACOES, dadosVisualizacao };`, contexto);
    return contexto.testadas;
}

test('oferece somente os acompanhamentos fixos na ordem definida', () => {
    const { OPCOES_VISUALIZACOES } = criarVisualizacoes([]);
    assert.deepEqual(Array.from(OPCOES_VISUALIZACOES, opcao => opcao.rotulo), [
        'Roberta',
        'Entrada Econ', 'Primeira Anual', 'Segunda Anual', 'Intermediária Ap',
        'Evolução Obra', 'Financiamento Casa', 'VCardoso', 'Trybe', 'Senac',
        'Roupa Intima', 'Seguro Residencial', 'Renegociação Nu', 'Iphone', 'Pós',
        'Banco do Brasil', 'Tênis (Isabella)',
    ]);
});

test('Roberta corresponde a categoria contendo o texto e nunca a entrada positiva', () => {
    const { dadosVisualizacao } = criarVisualizacoes([
        { nome: 'Aluguel', categ: 'Casa, Roberta', pago: true, v: -100 },
        { nome: 'Fatura', categ: 'Roberta', pago: false, v: -50 },
        { nome: 'Receita', categ: 'Roberta', pago: true, v: 500 },
        { nome: 'Outra', categ: 'Casa', pago: false, v: -80 },
    ]);
    const dados = dadosVisualizacao('categoria-roberta');
    assert.deepEqual(Array.from(dados.linhas, linha => linha.nome), ['Aluguel', 'Fatura']);
    assert.equal(dados.pago, 100);
    assert.equal(dados.naoPago, 50);
});

test('nomes são exatos sem diferenciar caixa ou acento', () => {
    const { OPCOES_VISUALIZACOES, dadosVisualizacao } = criarVisualizacoes([
        { nome: 'EVOLUÇÃO OBRA', categ: 'Casa', pago: false, v: -200 },
        { nome: 'Evolução Obra Extra', categ: 'Casa', pago: false, v: -300 },
    ]);
    const id = OPCOES_VISUALIZACOES.find(opcao => opcao.rotulo == 'Evolução Obra').id;
    assert.deepEqual(Array.from(dadosVisualizacao(id).linhas, linha => linha.v), [-200]);
});

test('Tênis exige simultaneamente o nome exato e categoria contendo Isabella', () => {
    const { dadosVisualizacao } = criarVisualizacoes([
        { nome: 'Tênis', categ: 'Isabella, Presente', pago: true, v: -150 },
        { nome: 'Tenis', categ: 'Casa', pago: false, v: -200 },
        { nome: 'Tênis infantil', categ: 'Isabella', pago: false, v: -100 },
    ]);
    assert.deepEqual(Array.from(dadosVisualizacao('tenis-isabella').linhas, linha => linha.v), [-150]);
});
