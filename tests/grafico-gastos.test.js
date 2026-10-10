// Pizza de gastos: agrupa despesas reais e evita contar transferência de fatura duas vezes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const inicio = fonte.indexOf('const PERCENTUAL_MINIMO_PIZZA');
const fim = fonte.indexOf('\n// clique numa celula', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou os dados da pizza de gastos.');

function dadosDoGrafico(lancamentos) {
    const contexto = {
        Estado: { ciclos: [{ fat: '2026-10-12' }], lancamentos },
        ehTransferenciaFatura: r => !r.cred && /antecipação de fatura/i.test(`${r.nome || ''} ${r.categ || ''}`),
        ajusteDoCiclo: () => null,
        textoOuTraco: valor => String(valor || '-'),
        categoriasSeparadas: valor => String(valor || '').split(',').map(c => c.trim()).filter(Boolean),
        ehCategoria: (categoria, procurada) => String(categoria).trim().toLowerCase() === String(procurada).toLowerCase(),
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\nglobalThis.regras = { dadosDoGraficoCiclo, categoriasMinimasDaPizza, ordenarCategoriasDoGrafico, proximaExclusaoDasCategorias, agruparGastosDaPizza };`, contexto);
    return contexto.regras;
}

test('pizza oculta Reserva e mantém a outra categoria sem duplicação', () => {
    const regras = dadosDoGrafico([
        { periodoIdx: 0, cred: false, nome: 'Mercado', categ: 'Casa, Reserva', v: -100 },
        { periodoIdx: 0, cred: false, nome: 'Antecipação de Fatura', categ: 'Fatura', v: -200 },
        { periodoIdx: 0, cred: true, nome: 'Compra cartão', categ: 'Eletrônicos', v: -300 },
    ]);

    const dados = regras.dadosDoGraficoCiclo(0);
    assert.deepEqual(Array.from(dados.categorias), ['Casa']);
    assert.deepEqual(Array.from(dados.categoriasCompartilhadas), []);
    assert.deepEqual(Array.from(dados.gastos, gasto => ({ categorias: Array.from(gasto.categorias), valor: gasto.valor })), [
        { categorias: ['Casa'], valor: 100 },
    ]);
});

test('pizza mantém somente categorias de ao menos dois por cento do recorte', () => {
    const regras = dadosDoGrafico([]);
    const resultado = regras.categoriasMinimasDaPizza({ Casa: 96, Pequena: 1.99, Reserva: 2.01 });
    assert.equal(resultado.total, 100);
    assert.deepEqual(Array.from(resultado.categorias), ['Casa', 'Reserva']);
});

test('seletor prioriza categorias compartilhadas antes das simples', () => {
    const regras = dadosDoGrafico([]);
    assert.deepEqual(Array.from(regras.ordenarCategoriasDoGrafico(
        ['Transporte', 'Casa', 'Reserva', 'Lazer'], new Set(['Reserva', 'Casa'])
    )), ['Casa', 'Reserva', 'Lazer', 'Transporte']);
});

test('comando do seletor alterna entre incluir e excluir todas as categorias do ciclo', () => {
    const regras = dadosDoGrafico([]);
    assert.deepEqual(Array.from(regras.proximaExclusaoDasCategorias(['Casa', 'Lazer'], [])), ['Casa', 'Lazer']);
    assert.deepEqual(Array.from(regras.proximaExclusaoDasCategorias(['Casa', 'Lazer'], ['Casa', 'Outra'])), ['Outra']);
    assert.match(fonte, /id=excluirCatTudo/);
});

test('clique fora do seletor no modal fecha o dropdown antes do gráfico tratar o gesto', () => {
    assert.match(fonte, /modalGrafico'\)\.addEventListener\('pointerdown'/);
    assert.match(fonte, /!e\.target\.closest\('#excluirCatWrap'\)/);
});

test('fatia mantém as linhas reais para abrir seu detalhamento no recorte atual', () => {
    const regras = dadosDoGrafico([]);
    const linha = { id: 12, nome: 'Mercado', v: -100 };
    const agrupado = regras.agruparGastosDaPizza([{ categorias: ['Casa'], valor: 100, linha }], []);
    assert.deepEqual({ ...agrupado.porCategoria }, { Casa: 100 });
    assert.deepEqual(Array.from(agrupado.linhasPorCategoria.Casa), [linha]);
    assert.match(fonte, /onClick: \(_evento, elementos\)/);
    assert.match(fonte, /abrirDetalheFatiaGrafico/);
});
