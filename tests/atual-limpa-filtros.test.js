// Botão Atual (ícone): volta ao ciclo atual e limpa os filtros, no lugar do antigo botão
// "Limpar filtros", que saiu da barra.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const pagina = fs.readFileSync('index.html', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Roda limparFiltros (charts.js) e o handler do Atual (interactions.js) reais com um DOM mínimo.
function montaTela(idxHoje) {
    const elementos = {};
    const ctx = {
        el: id => (elementos[id] ||= { value: 'x' }),
        Estado: {
            idxHoje, filtroTexto: { nome: 'café' }, fechados: { db: true }, selecionados: new Set(['5']),
            ordenacaoPorTabela: { db: { k: 'valor', d: -1 } }, ordComp: { k: 'nome', d: 1 },
        },
        CATEGORIA_EXCLUIDA_GRAFICO_PADRAO: 'Contabilidade',
        excluidasDoGrafico: [],
        desenhos: 0,
    };
    ctx.desenhar = () => { ctx.desenhos++; };
    ctx.abrirBlocosFinanceiros = () => { ctx.Estado.fechados.db = false; ctx.Estado.fechados.cr = false; };
    const limpar = graficos.slice(graficos.indexOf('const FILTROS_PADRAO'), graficos.indexOf('\n}\n', graficos.indexOf('function limparFiltros')) + 3);
    const inicio = interacoes.indexOf("el('cicloHoje').onclick");
    const handler = interacoes.slice(inicio, interacoes.indexOf('\n};', inicio) + 3);
    vm.runInNewContext(`${limpar}\n${handler}\nthis.clicaAtual = () => el('cicloHoje').onclick();\nthis.excluidas = () => excluidasDoGrafico;`, ctx);
    return { ctx, elementos };
}

test('Atual volta De/Até ao ciclo de hoje e limpa todos os filtros, com um único redesenho', () => {
    const { ctx, elementos } = montaTela(3);
    ctx.clicaAtual();
    assert.equal(elementos.compDe.value, 3);
    assert.equal(elementos.compAte.value, 3);
    assert.equal(elementos.somenteDif.value, 'N');
    assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), []);
    assert.equal(ctx.Estado.selecionados.size, 0);
    assert.deepEqual(Object.keys(ctx.Estado.ordenacaoPorTabela), []);
    assert.equal(ctx.Estado.ordComp.k, 'total');
    assert.equal(ctx.excluidas().join(), 'Contabilidade');
    assert.equal(ctx.Estado.fechados.db, false);
    assert.equal(ctx.desenhos, 1);
});

test('sem ciclo atual, Atual só limpa os filtros (De/Até vazios, como a página abre)', () => {
    const { ctx, elementos } = montaTela(-1);
    ctx.clicaAtual();
    assert.equal(elementos.compDe.value, '');
    assert.equal(elementos.compAte.value, '');
    assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), []);
    assert.equal(ctx.desenhos, 1);
    // Nunca fica desabilitado: sempre há o que limpar.
    assert.doesNotMatch(interacoes, /el\('cicloHoje'\)\.disabled/);
});

test('Atual é ícone com title e aria-label, no mesmo lugar; não há mais botão Limpar filtros', () => {
    const nav = pagina.slice(pagina.indexOf('id=cicloProximo'), pagina.indexOf('id=toggleSimulacao'));
    assert.match(nav, /<button type=button id=cicloHoje class=btHoje title="Ciclo atual e limpar filtros"\s*\n\s*aria-label="Ir para o ciclo atual e limpar filtros">\s*\n\s*<svg/);
    assert.doesNotMatch(nav, />Atual</);
    assert.doesNotMatch(pagina, /btLimparFiltros|id=flimpar/);
    assert.doesNotMatch(graficos + interacoes, /btLimparFiltros|'flimpar'/);
    assert.match(estilos, /#navComparar \.btHoje \{\s*\n\s*display: inline-flex;[\s\S]*?width: 2\.2rem;/);
    assert.match(regras, /\*\*Atual\*\* é um ícone \(alvo\), no mesmo lugar, logo depois da seta ›: volta De\/Até ao ciclo atual e também limpa os filtros/);
    assert.match(regras, /Não existe mais botão "Limpar filtros" separado/);
});

test('Gráfico e Consolidar tudo são ícones logo depois do Atual, com title e aria-label', () => {
    const acoes = pagina.slice(pagina.indexOf('id=cicloHoje'), pagina.indexOf('id=toggleSimulacao'));
    assert.match(acoes, /<button type=button id=btGrafico class=btIcone title="Gráfico" aria-label="Gráfico">\s*\n\s*<svg/);
    assert.match(acoes, /<button type=button id=btConsolidarTudo class=btIcone title="Consolidar tudo: [^"]*" aria-label="Consolidar tudo">\s*\n\s*<svg/);
    assert.doesNotMatch(acoes, />Gráfico<\/button>|>Consolidar tudo<\/button>/);
    assert.ok(acoes.indexOf('id=btGrafico') < acoes.indexOf('id=btConsolidarTudo'));
    // Fora de #rowVis: a conta restrita precisa escondê-los à parte.
    const barra = pagina.slice(pagina.indexOf('id=rowVis'), pagina.indexOf('id=indicadoresFinanceiros'));
    assert.doesNotMatch(barra, /btGrafico|btConsolidarTudo/);
    assert.match(interacoes, /el\('btGrafico'\)\.hidden = simples;\s*\n\s*el\('btConsolidarTudo'\)\.hidden = simples;/);
    assert.match(estilos, /\.btIcone \{[\s\S]*?width: 2\.2rem;\s*\n\s*height: 2\.2rem;/);
    assert.match(estilos, /\.btIcone:disabled \{\s*\n\s*opacity: \.5;/);
    assert.match(estilos, /\.btIcone\.carregando svg \{\s*\n\s*animation: girar/);
    assert.match(regras, /\*\*Gráfico\*\* \(ícone de barras\) e \*\*Consolidar tudo\*\* \(ícone de duplo check\) são botões só de ícone[^.]*logo depois do ícone \*\*Atual\*\* \(seta ›, Atual, Gráfico, Consolidar tudo\)/);
});
