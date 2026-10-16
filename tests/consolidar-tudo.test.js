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
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');

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
    assert.match(formulario, /const ehAporte = ajuste\.tipo == 'aporte';\s*\n\s*const resultado = await materializaOuConsolidaAjuste\(idx, ehAporte, ajuste\.categ, ajuste\.v\);/);
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

test('botão fica desabilitado e com texto "Consolidando…" durante a varredura, bloqueando clique duplo', () => {
    const inicio = formulario.indexOf("el('btConsolidarTudo').onclick");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n};', inicio) + 3);
    assert.match(trecho, /const textoOriginal = el\('btConsolidarTudo'\)\.textContent;\s*\n\s*el\('btConsolidarTudo'\)\.disabled = true;/);
    assert.match(trecho, /el\('btConsolidarTudo'\)\.textContent = 'Recarregando…';/);
    assert.match(trecho, /el\('btConsolidarTudo'\)\.textContent = 'Consolidando…';/);
    // finally roda tanto no caminho feliz quanto no catch, então o texto e o disabled
    // voltam ao normal nos dois casos — sucesso ou falha.
    assert.match(trecho, /\} finally \{\s*\n\s*el\('btConsolidarTudo'\)\.disabled = false;\s*\n\s*el\('btConsolidarTudo'\)\.textContent = textoOriginal;\s*\n\s*\}/);
});

test('fica visualmente apagado enquanto desabilitado, igual Duplicar/Editar/Excluir e o Salvar do cadastro — não só o cursor nativo do navegador', () => {
    // .btFiltro só tinha estilo dentro do media query mobile (ver css/mobile.css); esta
    // regra fica em dashboard.css, fora de qualquer media query, pra também valer no
    // desktop — onde "Consolidar tudo" realmente roda.
    assert.match(estilos, /\.btFiltro:disabled \{\s*\n\s*opacity: \.5;\s*\n\s*cursor: default;\s*\n\s*\}/);
    assert.doesNotMatch(estilosMobile, /\.btFiltro:disabled/);
});

test('consolidar tudo corrige recorrências duplicadas ANTES de materializar/consolidar, no mesmo intervalo, recalculando o fim do intervalo depois', () => {
    assert.match(formulario, /const \{ corrigidos, log: logDatas \} = await corrigeRecorrenciasDuplicadasNoIntervalo\(Estado\.idxHoje, ultimoCicloAntesDaCorrecao\);/);
    assert.match(formulario, /async function corrigeRecorrenciasDuplicadasNoIntervalo\(idxInicio, idxFim\) \{/);
    assert.match(formulario, /const proximoCiclo = Estado\.ciclos\[idx \+ 1\];\s*\n\s*if \(!proximoCiclo\) continue;/);
    assert.match(formulario, /marcaOcorrenciasDuplicadasNoCiclo\(debitos, proximoCiclo\);/);
    assert.match(formulario, /for \(const r of debitos\.filter\(r => r\._dupCiclo\)\) \{/);
    assert.match(formulario, /const dataAntiga = r\.data;/);
    assert.match(formulario, /if \(!Estado\.simulando && !r\._sim\) await atualizarLancamento\(r\.id, \{ data: novaData \}\);/);
    assert.match(formulario, /r\.data = novaData;\s*\n\s*reclassificaPeriodo\(r\);\s*\n\s*delete r\._dupCiclo;\s*\n\s*corrigidos\+\+;/);
    assert.match(formulario, /log\.push\(`\$\{nomePeriodo\(Estado\.ciclos\[idx\]\)\}: "\$\{r\.nome \?\? ''\}" movida de \$\{dataBR\(dataAntiga\)\} para \$\{dataBR\(novaData\)\} \(recorrência duplicada no ciclo\)\.`\);/);
    assert.match(formulario, /return \{ corrigidos, log \};/);
});

test('cada ciclo limpa os caches financeiros antes do próximo, pois o guardado disponível muda', () => {
    assert.match(formulario, /const resultado = await materializaOuConsolidaAjuste\(idx, ehAporte, ajuste\.categ, ajuste\.v\);/);
    assert.match(formulario, /if \(resultado == 'consolidado'\) consolidados\+\+; else materializados\+\+;/);
    assert.match(formulario, /logAjustes\.push\(`[\s\S]*?`\);\s*\n\s*limparCachesFinanceiros\(\);/);
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
    assert.match(trecho, /const resumo = partes\.length\s*\n\s*\? `\$\{partes\.join\('; '\)\}\.`\s*\n\s*: 'Nenhum ciclo com Aporte sugerido, Resgate necessário ou recorrência duplicada pendente\.';/);
    assert.match(trecho, /mostrarToast\('Consolidar tudo', resumo\);/);
    assert.match(trecho, /catch \(err\) \{\s*mostrarToast\('Falhou ao consolidar tudo', err\.message\);\s*desenhar\(\);/);
});

test('também abre um modal com o detalhe ciclo a ciclo — resposta direta ao clique, não escondida atrás de outro botão', () => {
    const inicio = formulario.indexOf("el('btConsolidarTudo').onclick");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n};', inicio) + 3);
    assert.match(trecho, /const logAjustes = \[\];/);
    assert.match(trecho, /const ehAporte = ajuste\.tipo == 'aporte';/);
    assert.match(trecho, /logAjustes\.push\(`\$\{nomePeriodo\(Estado\.ciclos\[idx\]\)\}: \$\{resultado == 'consolidado' \? 'Consolidado' : 'Materializado'\} \$\{ehAporte \? 'Aporte' : 'Resgate'\} de \$\{brl\(Math\.abs\(ajuste\.v\)\)\}\.`\);/);
    // Só abre quando algo foi gravado; sem nada a fazer, fica só o toast.
    assert.match(trecho, /if \(partes\.length\) mostrarResultadoConsolidarTudo\(resumo, \[\.\.\.logDatas, \.\.\.logAjustes\]\);/);
    assert.equal((trecho.match(/mostrarResultadoConsolidarTudo\(/g) || []).length, 1);

    assert.match(pagina, /<dialog id=modalConsolidarTudo>/);
    assert.match(pagina, /<p class=meta id=textoConsolidarTudo><\/p>/);
    assert.match(pagina, /<ul class=listaDiagnostico id=listaConsolidarTudo><\/ul>/);

    const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
    assert.match(dadosUi, /function mostrarResultadoConsolidarTudo\(resumo, log\) \{/);
    assert.match(dadosUi, /el\('textoConsolidarTudo'\)\.textContent = resumo;/);
    assert.match(dadosUi, /preencherListaDiagnostico\('listaConsolidarTudo', log\);/);
    assert.match(dadosUi, /if \(!el\('modalConsolidarTudo'\)\.open\) el\('modalConsolidarTudo'\)\.showModal\(\);/);

    const inicializacao = fs.readFileSync('js/bootstrap.js', 'utf8');
    assert.match(inicializacao, /el\('modalConsolidarTudo'\)\.addEventListener\('click', e => \{\s*\n\s*if \(e\.target == el\('modalConsolidarTudo'\)\) el\('modalConsolidarTudo'\)\.close\(\);\s*\n\s*\}\);/);

    const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(estilosForm, /dialog#modalDiagnostico::backdrop,\s*\n\s*dialog#modalConsolidarTudo::backdrop \{\s*\n\s*background: rgba\(0, 0, 0, \.68\);/);
    assert.match(estilosForm, /dialog#modalDiagnostico,\s*\n\s*dialog#modalAjudaCategorias,\s*\n\s*dialog#modalConsolidarTudo \{/);
    assert.match(estilosForm, /#listaConsolidarTudo \{\s*\n\s*color: var\(--mu\);\s*\n\s*\}/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /\*\*Consolidar tudo\*\* repete essa mesma ação \(materializar\/consolidar\) em sequência, do ciclo atual até o último ciclo que tiver algum lançamento/);
    assert.match(regras, /o próprio botão fica desabilitado \(`disabled`, de verdade bloqueado pro navegador — mesmo esquema visual apagado do Salvar do cadastro e do Duplicar\/Editar\/Excluir da barra de seleção/);
    assert.match(regras, /e o texto muda pra "Recarregando…" e depois "Consolidando…", pra bloquear clique duplo/);
    assert.match(regras, /volta ao normal \("Consolidar tudo"\) ao final, com sucesso ou falha/);
    assert.match(regras, /ela também corrige toda recorrência duplicada nesse mesmo intervalo \(mesma regra do botão "↷" ao lado da Data/);
    assert.match(regras, /sem pedir confirmação por linha, já que o clique em "Consolidar tudo" é a confirmação da varredura inteira/);
    assert.match(regras, /Ciclos anteriores ao atual nunca entram nessa varredura\./);
    assert.match(regras, /a conclusão sempre aparece em toast contando quantos foram materializados, quantos foram consolidados e quantas datas de recorrência duplicada foram corrigidas/);
    assert.match(regras, /abre sozinho um modal \(`#modalConsolidarTudo`\) com o mesmo resumo e uma linha por ação de verdade executada/);
    assert.match(regras, /Quando a varredura não encontra nada a fazer, aparece só o toast \("Nenhum ciclo com Aporte sugerido, Resgate necessário ou recorrência duplicada pendente\."\), sem modal/);
    assert.match(regras, /Diferente do modal de diagnóstico de carga \(que só abre por escolha do usuário, pra não interromper a consulta\), este abre automaticamente porque é resposta direta a um clique explícito do próprio usuário/);
    assert.match(regras, /sem botão de fechar, mesmo padrão de clicar fora ou Esc/);
    assert.match(regras, /Não altera nem recalcula nada: só lê o que a varredura já gravou\./);
});

test('sempre recarrega do banco antes de varrer; carga com falha para tudo; simulação não recarrega', () => {
    const inicio = formulario.indexOf("el('btConsolidarTudo').onclick");
    const trecho = formulario.slice(inicio, formulario.indexOf('\n};', inicio) + 3);
    assert.match(trecho, /if \(!Estado\.simulando\) \{\s*\n\s*el\('btConsolidarTudo'\)\.textContent = 'Recarregando…';\s*\n\s*if \(!\(await load\(\)\)\) return;\s*\n\s*if \(Estado\.idxHoje < 0\) return;\s*\n\s*\}/);
    // A recarga vem antes de qualquer leitura de Estado.lancamentos pela varredura.
    assert.ok(trecho.indexOf('await load()') < trecho.indexOf('corrigeRecorrenciasDuplicadasNoIntervalo('));
    const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
    assert.match(dadosUi, /atualizarBotaoDiagnostico\(diagnosticoDeDados\);\s*\n\s*return true;/);
    assert.match(dadosUi, /mostrarToast\('Não foi possível carregar', e\.message\);\s*\n\s*return false;/);
    assert.match(regras, /Antes de varrer, \*\*Consolidar tudo\*\* sempre recarrega os dados do banco/);
});
