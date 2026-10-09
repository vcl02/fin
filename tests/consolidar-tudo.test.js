// Regressão do botão "Consolidar tudo": repete materializar/consolidar ciclo a ciclo sem
// abrir um por um, reaproveitando a mesma regra de aporte/resgate já usada na linha única.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const financeiro = fs.readFileSync('js/finance.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');

test('botão fica na toolbar de desktop, com título explicando o alcance', () => {
    assert.match(pagina, /id=btConsolidarTudo class=btFiltro title="[^"]*hoje até o último ciclo com lançamentos[^"]*"/);
    // .tool inteiro some no mobile (mesma regra de btGrafico/Limpar filtros ao lado), sem
    // precisar de uma regra de visibilidade própria pra este botão.
    assert.match(estilosMobile, /\.tool\s*\{\s*display:\s*none;/);
});

test('materializar/consolidar foi extraído pra uma função única, reaproveitada pelas duas ações', () => {
    assert.match(formulario, /async function materializaOuConsolidaAjuste\(idx, ehAporte, categ, valorAjuste\)/);
    assert.match(formulario, /await materializaOuConsolidaAjuste\(indiceDoAjuste\(chave\), ehAporte, ajuste\.categ, valorAjuste\);/);
    assert.match(formulario, /await materializaOuConsolidaAjuste\(idx, ajuste\.tipo == 'aporte', ajuste\.categ, ajuste\.v\);/);
    // a função usa o fim do próprio ciclo (Estado.ciclos[idx].fat), não mais ajuste.data de
    // uma linha renderizada — ela tem que funcionar pra ciclo nenhum estar na tela.
    assert.match(formulario, /const data = dataISO\(Estado\.ciclos\[idx\]\.fat\) \|\| null;/);
});

test('consolidar tudo varre do ciclo atual até o último com lançamento, nunca o passado', () => {
    assert.match(formulario, /el\('btConsolidarTudo'\)\.onclick = async \(\) => \{/);
    assert.match(formulario, /if \(el\('btConsolidarTudo'\)\.disabled \|\| Estado\.idxHoje < 0\) return;/);
    assert.match(formulario, /const ultimoCicloComDados = Estado\.lancamentos\.reduce\(\s*\(max, r\) => r\.periodoIdx != null && r\.periodoIdx > max \? r\.periodoIdx : max,\s*Estado\.idxHoje\s*\);/);
    assert.match(formulario, /for \(let idx = Estado\.idxHoje; idx <= ultimoCicloComDados; idx\+\+\) \{/);
    assert.match(formulario, /const ajuste = ajusteDoCiclo\(idx\);\s*\n\s*if \(!ajuste\) continue;/);
});

test('cada ciclo limpa os caches financeiros antes do próximo, pois o guardado disponível muda', () => {
    assert.match(formulario, /await materializaOuConsolidaAjuste\(idx, ajuste\.tipo == 'aporte', ajuste\.categ, ajuste\.v\);\s*\n\s*limparCachesFinanceiros\(\);/);
    assert.match(financeiro, /function limparCachesFinanceiros\(\) \{/);
    assert.match(financeiro, /Object\.keys\(_cacheSaldo\)\.forEach\(k => delete _cacheSaldo\[k\]\);/);
    assert.match(financeiro, /_baseFiltrada = _abatFiltrada = _baseUnica = _abatUnica = null;/);
    // desenhar() passou a reaproveitar a mesma função, em vez de repetir as 5 linhas.
    assert.match(interacoes, /function desenhar\(\) \{\s*limparCachesFinanceiros\(\);/);
});

test('falha no meio da varredura avisa por toast e redesenha com o progresso já feito', () => {
    const inicio = formulario.indexOf("el('btConsolidarTudo').onclick");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n};', inicio) + 3);
    assert.match(trecho, /catch \(err\) \{\s*mostrarToast\('Falhou ao consolidar tudo', err\.message\);\s*desenhar\(\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /\*\*Consolidar tudo\*\* repete essa mesma ação \(materializar\/consolidar\) em sequência, do ciclo atual até o último ciclo que tiver algum lançamento/);
    assert.match(regras, /Ciclos anteriores ao atual nunca entram nessa varredura\./);
});
