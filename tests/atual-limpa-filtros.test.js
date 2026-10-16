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
function montaTela(idxHoje, { restrito = false, simulando = false } = {}) {
    const elementos = {};
    const ctx = {
        el: id => (elementos[id] ||= { value: 'x', classList: { add() {}, remove() {} } }),
        Estado: {
            idxHoje, filtroTexto: { nome: 'café' }, fechados: { db: true }, selecionados: new Set(['5']),
            ordenacaoPorTabela: { db: { k: 'valor', d: -1 } }, ordComp: { k: 'nome', d: 1 }, simulando,
        },
        CATEGORIA_EXCLUIDA_GRAFICO_PADRAO: 'Contabilidade',
        excluidasDoGrafico: [],
        desenhos: 0,
        chamadas: [],
    };
    ctx.modoRestrito = () => restrito;
    // Ordem das etapas: o que foi desenhado antes de consolidar/recarregar.
    ctx.consolidarTudo = async botao => { ctx.chamadas.push(['consolidar', ctx.desenhos, botao === elementos.cicloHoje]); };
    ctx.load = async () => { ctx.chamadas.push(['load', ctx.desenhos, elementos.cicloHoje.disabled]); return true; };
    ctx.desenhar = () => { ctx.desenhos++; };
    ctx.abrirBlocosFinanceiros = () => { ctx.Estado.fechados.db = false; ctx.Estado.fechados.cr = false; };
    const limpar = graficos.slice(graficos.indexOf('const FILTROS_PADRAO'), graficos.indexOf('\n}\n', graficos.indexOf('function limparFiltros')) + 3);
    const inicio = interacoes.indexOf("el('cicloHoje').onclick");
    const handler = interacoes.slice(inicio, interacoes.indexOf('\n};', inicio) + 3);
    vm.runInNewContext(`${limpar}\n${handler}\nthis.clicaAtual = () => el('cicloHoje').onclick();\nthis.excluidas = () => excluidasDoGrafico;`, ctx);
    return { ctx, elementos };
}

test('Atual volta ao ciclo de hoje e limpa todos os filtros na hora, e depois consolida tudo', async () => {
    const { ctx, elementos } = montaTela(3);
    await ctx.clicaAtual();
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
    // Consolidar tudo (que recarrega antes) roda depois de navegar/limpar, com o próprio Atual.
    assert.deepEqual(ctx.chamadas, [['consolidar', 1, true]]);
});

test('conta restrita: Atual navega, limpa e só recarrega — nunca consolida', async () => {
    const { ctx } = montaTela(3, { restrito: true });
    await ctx.clicaAtual();
    assert.deepEqual(ctx.chamadas, [['load', 1, true]]);
    const { ctx: simulando } = montaTela(3, { restrito: true, simulando: true });
    await simulando.clicaAtual();
    assert.deepEqual(simulando.chamadas, []);
});

test('sem ciclo atual, Atual limpa os filtros (De/Até vazios, como a página abre)', async () => {
    const { ctx, elementos } = montaTela(-1);
    await ctx.clicaAtual();
    assert.equal(elementos.compDe.value, '');
    assert.equal(elementos.compAte.value, '');
    assert.deepEqual(Object.keys(ctx.Estado.filtroTexto), []);
    assert.equal(ctx.desenhos, 1);
    // consolidarTudo recarrega e só então desiste sozinho se hoje não cair em ciclo nenhum.
    assert.deepEqual(ctx.chamadas, [['consolidar', 1, true]]);
});

test('Atual é ícone com title e aria-label, no mesmo lugar; não há mais botão Limpar filtros', () => {
    const nav = pagina.slice(pagina.indexOf('id=cicloProximo'), pagina.indexOf('id=toggleSimulacao'));
    assert.match(nav, /<button type=button id=cicloHoje class=btHoje title="Ciclo atual: limpa filtros, recarrega e consolida tudo"\s*\n\s*aria-label="Ciclo atual, limpar filtros, recarregar e consolidar tudo">\s*\n\s*<svg/);
    assert.doesNotMatch(nav, />Atual</);
    assert.doesNotMatch(pagina, /btLimparFiltros|id=flimpar/);
    assert.doesNotMatch(graficos + interacoes, /btLimparFiltros|'flimpar'/);
    assert.match(estilos, /#navComparar \.btHoje \{\s*\n\s*display: inline-flex;[\s\S]*?width: 2\.2rem;/);
    assert.match(regras, /\*\*Atual\*\* é um ícone \(alvo\), no mesmo lugar, logo depois da seta ›: volta De\/Até ao ciclo atual e também limpa os filtros/);
    assert.match(regras, /Não existem mais botões "Limpar filtros" nem "Consolidar tudo" separados: o Atual faz os três\./);
    assert.match(regras, /Na conta restrita, que nunca grava, o Atual só navega, limpa e recarrega\./);
    assert.match(estilos, /\.btHoje\.carregando svg \{\s*\n\s*animation: girar/);
    assert.match(estilos, /#navComparar \.btHoje:disabled \{\s*\n\s*opacity: \.5;/);
});

test('Gráfico e Visualizações são ícones logo depois do Atual; Consolidar tudo não tem botão próprio', () => {
    const acoes = pagina.slice(pagina.indexOf('id=cicloHoje'), pagina.indexOf('id=toggleSimulacao'));
    assert.match(acoes, /<button type=button id=btGrafico class=btIcone title="Gráfico" aria-label="Gráfico">\s*\n\s*<svg/);
    assert.doesNotMatch(pagina, /btConsolidarTudo/);
    assert.doesNotMatch(acoes, />Gráfico<\/button>/);
    assert.ok(acoes.indexOf('id=btGrafico') < acoes.indexOf('id=visIcone'));
    // Fora de #rowVis: a conta restrita precisa escondê-los à parte.
    const barra = pagina.slice(pagina.indexOf('id=rowVis'), pagina.indexOf('id=indicadoresFinanceiros'));
    assert.doesNotMatch(barra, /btGrafico|btVis/);
    assert.match(interacoes, /el\('btGrafico'\)\.hidden = simples;\s*\n\s*el\('visIcone'\)\.hidden = simples;/);
    // Menu próprio solto abaixo do ícone, não colado nele.
    assert.match(estilos, /\.menuIcone \{\s*\n\s*position: absolute;\s*\n\s*top: calc\(100% \+ \.45rem\);/);
    assert.match(regras, /\*\*Visualizações\*\* é um ícone \(olho\) na navegação de ciclo, logo depois do Gráfico/);
    assert.match(estilos, /\.btIcone \{[\s\S]*?width: 2\.2rem;\s*\n\s*height: 2\.2rem;/);
    assert.match(estilos, /\.btIcone:disabled \{\s*\n\s*opacity: \.5;/);
    assert.match(regras, /\*\*Gráfico\*\* \(ícone de barras\) é botão só de ícone[^.]*logo depois do ícone \*\*Atual\*\* \(seta ›, Atual, Gráfico, Visualizações\)/);
});

test('navegação de ciclo quebra linha em vez de sobrepor o cabeçalho, e no mobile os ícones cabem ao lado do Até', () => {
    const mobile = fs.readFileSync('css/mobile.css', 'utf8');
    assert.match(estilos, /#navComparar \{\s*\n\s*display: flex;\s*\n\s*flex-direction: row;\s*\n\s*flex-wrap: wrap;/);
    assert.match(mobile, /#fate \{\s*\n\s*flex: 1 1 0;\s*\n\s*min-width: 9rem;/);
    assert.match(mobile, /#navComparar \.btNavCiclo,\s*\n\s*#navComparar \.btHoje,\s*\n\s*#navComparar \.btIcone \{\s*\n\s*width: 2rem;/);
});

test('menu de Visualizações fecha ao escolher, ao clicar fora e com Esc, e não sai da tela', () => {
    assert.match(graficos, /el\('visMenu'\)\.onclick = e => \{[\s\S]*?fecharMenuVis\(\);\s*\n\s*abrirVisualizacao\(item\.dataset\.vis\);/);
    assert.match(graficos, /if \(!el\('visMenu'\)\.hidden && !el\('visIcone'\)\.contains\(e\.target\)\) fecharMenuVis\(\);/);
    assert.match(graficos, /if \(e\.key === 'Escape' && !el\('visMenu'\)\.hidden\) \{ fecharMenuVis\(\); el\('btVis'\)\.focus\(\); \}/);
    assert.match(graficos, /if \(sobra < 0\) menu\.style\.left = `\$\{sobra\}px`;/);
});
