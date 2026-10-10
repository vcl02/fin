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

test('botão fica na toolbar, com título explicando o alcance', () => {
    assert.match(pagina, /id=btConsolidarTudo class=btFiltro title="[^"]*hoje até o último ciclo com lançamentos[^"]*"/);
    // .tool tem paridade total com o desktop: fica sempre visível, em qualquer largura —
    // sem regra própria escondendo este botão no mobile (só a conta restrita o esconde,
    // junto com o resto de #rowVis, testado em preferencias-interface.test.js).
    assert.doesNotMatch(estilosMobile, /\.tool\s*\{\s*display:\s*none;/);
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
    assert.match(formulario, /const ultimoCicloAntesDaCorrecao = Estado\.lancamentos\.reduce\(\s*\(max, r\) => r\.periodoIdx != null && r\.periodoIdx > max \? r\.periodoIdx : max,\s*Estado\.idxHoje\s*\);/);
    assert.match(formulario, /const ultimoCicloComDados = Estado\.lancamentos\.reduce\(\s*\(max, r\) => r\.periodoIdx != null && r\.periodoIdx > max \? r\.periodoIdx : max,\s*ultimoCicloAntesDaCorrecao\s*\);/);
    assert.match(formulario, /for \(let idx = Estado\.idxHoje; idx <= ultimoCicloComDados; idx\+\+\) \{/);
    assert.match(formulario, /const ajuste = ajusteDoCiclo\(idx\);\s*\n\s*if \(!ajuste\) continue;/);
});

test('consolidar tudo corrige recorrências duplicadas ANTES de materializar/consolidar, no mesmo intervalo, recalculando o fim do intervalo depois', () => {
    assert.match(formulario, /const corrigidos = await corrigeRecorrenciasDuplicadasNoIntervalo\(Estado\.idxHoje, ultimoCicloAntesDaCorrecao\);/);
    assert.match(formulario, /async function corrigeRecorrenciasDuplicadasNoIntervalo\(idxInicio, idxFim\) \{/);
    assert.match(formulario, /const proximoCiclo = Estado\.ciclos\[idx \+ 1\];\s*\n\s*if \(!proximoCiclo\) continue;/);
    assert.match(formulario, /marcaOcorrenciasDuplicadasNoCiclo\(debitos, proximoCiclo\);/);
    assert.match(formulario, /for \(const r of debitos\.filter\(r => r\._dupCiclo\)\) \{/);
    assert.match(formulario, /if \(!Estado\.simulando && !r\._sim\) await atualizarLancamento\(r\.id, \{ data: novaData \}\);/);
    assert.match(formulario, /r\.data = novaData;\s*\n\s*reclassificaPeriodo\(r\);\s*\n\s*delete r\._dupCiclo;\s*\n\s*corrigidos\+\+;\s*\n\s*limparCachesFinanceiros\(\);/);
});

test('cada ciclo limpa os caches financeiros antes do próximo, pois o guardado disponível muda', () => {
    assert.match(formulario, /const resultado = await materializaOuConsolidaAjuste\(idx, ajuste\.tipo == 'aporte', ajuste\.categ, ajuste\.v\);/);
    assert.match(formulario, /if \(resultado == 'consolidado'\) consolidados\+\+; else materializados\+\+;\s*\n\s*limparCachesFinanceiros\(\);/);
    assert.match(financeiro, /function limparCachesFinanceiros\(\) \{/);
    assert.match(financeiro, /Object\.keys\(_cacheSaldo\)\.forEach\(k => delete _cacheSaldo\[k\]\);/);
    assert.match(financeiro, /_baseFiltrada = _abatFiltrada = null;/);
    // desenhar() passou a reaproveitar a mesma função, em vez de repetir as 5 linhas.
    assert.match(interacoes, /function desenhar\(\) \{\s*limparCachesFinanceiros\(\);/);
});

test('núcleo retorna consolidado/materializado pro resumo contar cada tipo separadamente', () => {
    assert.match(formulario, /return existente \? 'consolidado' : 'materializado';/);
});

test('conclusão sempre aparece em toast, juntando materialização/consolidação e correção de datas num só resumo', () => {
    const inicio = formulario.indexOf("el('btConsolidarTudo').onclick");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n};', inicio) + 3);
    assert.match(trecho, /const partes = \[\];\s*\n\s*if \(materializados \|\| consolidados\) partes\.push\(`\$\{materializados\} materializado\(s\), \$\{consolidados\} consolidado\(s\)`\);\s*\n\s*if \(corrigidos\) partes\.push\(`\$\{corrigidos\} data\(s\) de recorrência duplicada corrigida\(s\)`\);/);
    assert.match(trecho, /mostrarToast\('Consolidar tudo', partes\.length\s*\n\s*\? `\$\{partes\.join\('; '\)\}\.`\s*\n\s*: 'Nenhum ciclo com Aporte sugerido, Resgate necessário ou recorrência duplicada pendente\.'\);/);
    assert.match(trecho, /catch \(err\) \{\s*mostrarToast\('Falhou ao consolidar tudo', err\.message\);\s*desenhar\(\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /\*\*Consolidar tudo\*\* repete essa mesma ação \(materializar\/consolidar\) em sequência, do ciclo atual até o último ciclo que tiver algum lançamento/);
    assert.match(regras, /ela também corrige toda recorrência duplicada nesse mesmo intervalo \(mesma regra do botão "↷" ao lado da Data/);
    assert.match(regras, /sem pedir confirmação por linha, já que o clique em "Consolidar tudo" é a confirmação da varredura inteira/);
    assert.match(regras, /Ciclos anteriores ao atual nunca entram nessa varredura\./);
    assert.match(regras, /a conclusão sempre aparece em toast contando quantos foram materializados, quantos foram consolidados e quantas datas de recorrência duplicada foram corrigidas/);
});
