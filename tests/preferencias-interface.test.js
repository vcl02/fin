// Contrato de preferências visuais: grafite legível, ações compactas e mobile somente consulta/cadastro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const agentes = fs.readFileSync('AGENTS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const base = fs.readFileSync('css/base.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');

test('registra o tema grafite, ações por ícone e minimalismo como preferências', () => {
    assert.match(agentes, /dark mode definitivo, porém em tons de cinza escuro legíveis/);
    assert.match(agentes, /Prefira ícones a textos nos botões de ação/);
    assert.match(agentes, /formulários somente com campos necessários/);
    assert.match(decisoes, /tema é sempre escuro, mas em cinza grafite legível/);
    assert.match(base, /--bg: #1B1E21;/);
    assert.match(base, /--pa: #24272B;/);
});

test('mantém tooltips e descrições auxiliares curtos', () => {
    assert.match(regras, /Tooltips, rótulos auxiliares e descrições visíveis devem ser curtos/);
    assert.match(pagina, /title="Simular \(não salva\)"/);
    assert.match(pagina, /title="Limpar filtros"/);
    assert.doesNotMatch(pagina, /injeta lançamentos hipotéticos|ignora os filtros acima/);
    assert.match(tabelas, /title="Editar data"/);
    assert.match(visoes, /Possível recorrência duplicada/);
});

test('cadastro compacto usa ícones e defaults de crédito e pago', () => {
    assert.match(pagina, /id=fCred checked aria-label="Crédito"/);
    assert.match(pagina, /id=fPago checked aria-label="Pago"/);
    assert.match(pagina, /id=fDivide checked aria-label="Dividir a compra entre parcelas"/);
    assert.match(pagina, /forms\.css\?v=20260924-valor-sinal/);
    assert.match(pagina, /class=parcelasLinha/);
    assert.match(pagina, /<option value=1>À vista/);
    assert.doesNotMatch(pagina, /À vista \(1x\)|Separe mais de uma categoria por vírgula/);
    const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(estilosForm, /\.fmChkIco/);
    assert.match(estilosForm, /grid-template-columns: repeat\(2, 2\.9rem\)/);
    assert.match(estilosForm, /\.parcelasLinha/);
});

test('cabeçalho do cadastro concentra ícones e deixa o sinal ao lado do valor', () => {
    assert.match(pagina, /class=modalTituloAcoes>[\s\S]*id=tituloNovo[\s\S]*id=fCred[\s\S]*id=fPago[\s\S]*id=fechaNovo/);
    assert.match(pagina, /class=moneyLinha>[\s\S]*class=moneyWrap[\s\S]*id=fValor[\s\S]*<\/div>\s*<button type=button id=fSinal/);
    assert.doesNotMatch(pagina, /id=abreCalc|id=modalCalc/);
    assert.doesNotMatch(pagina, /class=moneyPrefix/);
    const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(estilosForm, /\.modalTituloAcoes/);
    assert.match(estilosForm, /\.moneyLinha/);
    assert.match(pagina, /id=fechaNovo title="Fechar" aria-label="Fechar">\s*<svg/);
    assert.match(estilosForm, /#formNovo \.modalHead\s*\{[\s\S]*justify-content:\s*flex-start/);
    assert.match(estilosForm, /#formNovo \.modalTituloAcoes\s*\{[\s\S]*flex:\s*1/);
    assert.match(estilosForm, /#formNovo \.modalTituloAcoes \.fmChecks\s*\{[\s\S]*margin-left:\s*auto/);
    assert.match(estilosForm, /#fechaNovo\s*\{[\s\S]*background:\s*var\(--red-soft\)/);
});

test('cadastro abre sem foco automático no mobile', () => {
    assert.match(formulario, /window\.matchMedia\('\(min-width: 641px\)'\)\.matches/);
});

test('cadastro mantém margem visível em todos os lados no mobile', () => {
    const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
    assert.match(estilosMobile, /dialog#modalNovo\s*\{[\s\S]*width: calc\(100vw - 2rem\);[\s\S]*height: calc\(100dvh - 2rem\);[\s\S]*border-radius: 16px;[\s\S]*margin: 1rem auto;/);
});

test('fatura à vista não repete o rótulo nem o asterisco', () => {
    assert.match(pagina, /id=fFaturasWrap hidden>\s*<span>Fatura<\/span>/);
    assert.match(formulario, /: 'Parcela única';/);
    assert.match(formulario, /function nomeFatura\(fatura\) \{\s*return dataBR\(fatura\.vencimento\);/);
});

test('visualizações usam um único dropdown com acompanhamentos fixos', () => {
    assert.match(pagina, /id=visAlvo class=btFiltro aria-label="Visualizações"/);
    assert.doesNotMatch(pagina, /id=visTipo|id=visAlvoRotulo/);
    assert.doesNotMatch(pagina, /id=btVisualizacoes|id=modalVisualizacoes|id=abreVisualizacao|id=voltaVisualizacoes/);
    assert.doesNotMatch(pagina, /id=btRoberta|id=btEmprestimo|id=btIphone/);
    assert.match(graficos, /const OPCOES_VISUALIZACOES/);
    assert.match(graficos, /categoriaContem: 'Roberta'/);
    assert.match(graficos, /id: 'tenis-isabella'[^\n]*nome: 'Tenis'[^\n]*categoriaContem: 'Isabella'/);
    assert.doesNotMatch(graficos, /function valoresDaVisualizacao|visTipo/);
    assert.match(graficos, /el\('visAlvo'\)\.onchange/);
    assert.match(graficos, /new Option\('Visualizações', ''\)/);
    assert.match(regras, /\*\*Visualizações\*\* é o próprio dropdown/);
    assert.match(regras, /seletor é fixo/);
    assert.match(regras, /nome `Tenis`/);
    assert.match(regras, /Toda visualização usa a mesma regra/);
    // No mobile, a regra de botão não pode apagar a imagem de fundo que desenha a seta do select.
    assert.match(estilosMobile, /\.btFiltro\s*\{[\s\S]*background-color: var\(--field\);/);
    assert.doesNotMatch(estilosMobile, /\.btFiltro\s*\{[\s\S]*?background: var\(--field\);/);
});

test('indicadores financeiros ficam ao lado de Limpar filtros, separados por pipe', () => {
    const acoes = pagina.slice(pagina.indexOf('id=rowVis'));
    assert.ok(acoes.indexOf('id=visAlvo') < acoes.indexOf('id=btGrafico'));
    assert.ok(acoes.indexOf('id=btGrafico') < acoes.indexOf('id=flimpar'));
    assert.ok(acoes.indexOf('id=flimpar') < acoes.indexOf('id=indicadoresFinanceiros'));
    assert.ok(acoes.indexOf('id=indicadorReserva') < acoes.indexOf('id=indicadorComprometido'));
    assert.ok(acoes.indexOf('id=indicadorComprometido') < acoes.indexOf('id=indicadorProporcaoReserva'));
    assert.ok(acoes.indexOf('id=indicadorProporcaoReserva') < acoes.indexOf('id=indicadorLiberdade'));
    assert.ok(acoes.indexOf('id=indicadorReserva') < acoes.indexOf('class=indicadorPipe'));
    assert.ok(acoes.indexOf('class=indicadorPipe') < acoes.indexOf('id=indicadorComprometido'));
    assert.match(pagina, /id=fdif[\s\S]*?<\/label>\s*<div id=rowVis>/);
    assert.doesNotMatch(pagina, /id=fpago|id=origem|id=fsit|id=forigem/);
    assert.match(pagina, /id=rowVis[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div id=out>/);
    const estilosPainel = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(estilosPainel, /\.tool > \.row\s*\{[\s\S]*flex-wrap:\s*nowrap/);
    assert.match(pagina, /class=indicadorPipe aria-hidden=true>\|/);
    assert.match(pagina, /id=indicadoresResumo[\s\S]*id=indicadoresVariacao/);
    assert.match(pagina, /id=variacaoReserva class=variacaoLinha hidden/);
    assert.match(pagina, /id=variacaoComprometido class=variacaoLinha hidden/);
    assert.match(estilosPainel, /\.indicadorRegra\s*\{[\s\S]*font-weight:\s*400/);
    assert.match(estilosPainel, /\.indicadorPercentual\s*\{[\s\S]*width:\s*6ch[\s\S]*font-variant-numeric:\s*tabular-nums/);
    assert.match(graficos, /Reserva: <span class=indicadorPercentual>/);
    assert.match(graficos, /Comprometido: <span class=indicadorPercentual>/);
    assert.match(graficos, /Gastos: Reserva <span class=indicadorPercentual>/);
    assert.match(graficos, /Liberdade: <span class=indicadorPercentual>/);
    assert.match(estilosPainel, /\.variacaoIndicador\.vd\s*\{\s*color:\s*var\(--vd\)/);
    assert.match(estilosPainel, /\.variacaoIndicador\.vm\s*\{\s*color:\s*var\(--vm\)/);
    assert.match(graficos, /variacaoValorIndicador\(reserva\.guardado, reservaAnterior\.guardado, true\)/);
    assert.match(graficos, /variacaoValorIndicador\(comprometido\.valor, comprometidosAnterior\.limites\[0\]\.valor, false\)/);
    assert.match(graficos, /atualizarLinhaVariacao\(\s*'variacaoReserva'/);
    assert.match(graficos, /atualizarLinhaVariacao\(\s*'variacaoComprometido'/);
    assert.doesNotMatch(graficos, /da meta\$\{htmlVariacaoIndicador/);
    assert.doesNotMatch(graficos, /do mês\$\{htmlVariacaoIndicador/);
    const blocoIndicadores = estilosPainel.slice(
        estilosPainel.indexOf('#indicadoresFinanceiros'), estilosPainel.indexOf('/* Reserva e Comprometido')
    );
    assert.match(blocoIndicadores, /grid-template-rows:\s*auto auto/);
    assert.match(estilosPainel, /#variacaoReserva\s*\{\s*grid-column:\s*1;\s*grid-row:\s*2/);
    assert.match(estilosPainel, /#variacaoComprometido\s*\{\s*grid-column:\s*3;\s*grid-row:\s*2/);
    assert.match(estilosPainel, /#indicadorProporcaoReserva\s*\{\s*grid-column:\s*5;\s*grid-row:\s*1/);
    assert.match(estilosPainel, /#indicadorLiberdade\s*\{\s*grid-column:\s*7;\s*grid-row:\s*1/);
    assert.match(interacoes, /atualizarIndicadoresFinanceiros\(\+el\('compAte'\)\.value\)/);
    assert.doesNotMatch(pagina, /id=btMetaReservaEmergencia|id=btCompromissos/);
    assert.match(interacoes, /if \(modoBlocos\) abrirGraficoGastos/);
    assert.match(interacoes, /else abrirGraficoEvolucao/);
    assert.doesNotMatch(interacoes, /mostraComFade\('(fgraf|fevol|fReserva)'/);
});

test('edição inline de data no desktop não confirma a cada dígito antes do segundo dígito do segmento', () => {
    // input type=date dispara 'change' assim que o valor fica completo, mesmo com um só
    // dígito do dia (ambíguo: "1" já é valor válido antes do "9" de "19" chegar). O
    // commit precisa esperar um instante e ser cancelado se outro 'input' chegar logo
    // depois, senão "19" vira "1" sem esperar Enter.
    assert.match(interacoes, /input\.addEventListener\('input', \(\) => clearTimeout\(timerConfirma\)\);/);
    assert.match(interacoes, /input\.addEventListener\('change', \(\) => \{\s*clearTimeout\(timerConfirma\);\s*timerConfirma = setTimeout\(confirma, 450\);\s*\}\);/);
    assert.match(interacoes, /ev\.key == 'Enter'.*clearTimeout\(timerConfirma\); confirma\(\);/);
});

test('edição inline de data não apaga a data ao perder o foco com dígito incompleto', () => {
    // "0" sozinho no dia nao e' um dia valido: o navegador marca badInput e deixa
    // input.value vazio, igual a quando a data e' apagada de proposito. Sem essa checagem,
    // perder o foco no meio da digitacao mandaria o lancamento pro Backlog sem querer.
    assert.match(interacoes, /if \(input\.validity && input\.validity\.badInput\) \{ desenhar\(\); return; \}/);
});

test('botão Excluir aceita várias linhas reais selecionadas, ignorando sintéticas misturadas', () => {
    // Antes só existia excluir UMA linha ([...Estado.selecionados.keys()][0]); agora o botão
    // fica visível com qualquer quantidade de linhas reais marcadas, e linhas sintéticas (ex.:
    // Saldo do mês anterior) na mesma seleção são ignoradas, pois não existem no banco.
    assert.match(interacoes, /const chavesReaisSelecionadas = chaves\.filter\(c => !ehSintetica\(c\)\);/);
    assert.match(interacoes, /el\('seldel'\)\.hidden = restrito \|\| !chavesReaisSelecionadas\.length;/);
    assert.doesNotMatch(formulario, /const chave = \[\.\.\.Estado\.selecionados\.keys\(\)\]\[0\];\s*\n\s*const i = Estado\.lancamentos\.findIndex\(x => String\(x\.id\) == chave\);\s*\n\s*if \(i < 0\) return;/);
    assert.match(formulario, /const linhas = \[\.\.\.Estado\.selecionados\.keys\(\)\]/);
    assert.match(formulario, /for \(const r of linhas\) \{/);
    assert.match(formulario, /lista = linhas\.map\(r => `- \$\{r\.nome \?\? ''\}/);
    assert.match(regras, /o botão Excluir da barra de seleção aceita quantas linhas reais estiverem marcadas/);
});

test('comparar mantém apenas todas ou diferentes confirmados sem recorrência duplicada', () => {
    assert.match(pagina, /id=somenteDif>[\s\S]*?<option value=N>Todas[\s\S]*?<option value=D>Diferentes/);
    assert.doesNotMatch(pagina, /<option value=S>Diferentes/);
    assert.doesNotMatch(pagina, /Diferentes \(ignorar repetidas\)/);
    assert.match(visoes, /const somenteDif = comparacao2Periodos && modoLinhas == 'D';/);
    assert.match(visoes, /Acabou em \$\{nomeMes1\}/);
    assert.match(visoes, /Começou em \$\{nomeMes2\}/);
    assert.match(visoes, /Único em \$\{nomeMes2\}/);
    assert.match(regras, /dois ciclos seguintes/);
});

test('conta restrita (Isabella) é identificada por e-mail, não a interface geral', () => {
    // Reintroduzido por pedido explícito do mantenedor: modoSimples volta a significar
    // "conta restrita", não mais "tela estreita" — mobile normal tem paridade total.
    assert.match(estado, /const EMAIL_ISABELLA = 'isabella\.251200@gmail\.com';/);
    assert.match(estado, /const modoRestrito = \(\) => String\(Estado\.emailSessao \|\| ''\)\.trim\(\)\.toLowerCase\(\) === EMAIL_ISABELLA;/);
    assert.match(estado, /const modoSimples = \(\) => modoRestrito\(\);/);
    assert.match(bootstrap, /Estado\.emailSessao = session\.user\?\.email \|\| null;/);
    assert.match(bootstrap, /Estado\.emailSessao = data\.user\?\.email \|\| null;/);
    // Flags antigas de modo restrito (form com checkbox fIsa/reserva) continuam fora —
    // essa reintrodução é só a checagem de e-mail, não aquele mecanismo antigo.
    assert.doesNotMatch(pagina, /id=fIsa|id=fReservaEmergencia/);
    assert.doesNotMatch(formulario, /\bisa\b|\breserva\b/);
    assert.doesNotMatch(graficos, /data-tog-reserva-emergencia/);
    // A categoria textual "Isabella" (fatura do cartão) é outro conceito: a nota de que
    // "ela" (a categoria) não muda a interface continua valendo, sem relação com a conta.
    assert.match(regras, /A categoria `Isabella` identifica esses lançamentos/);
});

test('mobile tem paridade total: mesmas colunas, edição e ações do desktop', () => {
    assert.match(estado, /const colunasAtivas = \(\) => COLS;/);
    assert.doesNotMatch(estado, /COLS_MOBILE/);
    assert.match(tabelas, /const celData = r => ehLinhaReal\(r\) && !modoRestrito\(\)/);
    assert.match(tabelas, /\? celValorEditavel\(r\) : celValor\(r\.v\)/);
    assert.doesNotMatch(tabelas, /celValorMobile/);
    assert.match(tabelas, /const podeSelecionar = selecionavel;/);
    assert.doesNotMatch(interacoes, /const linha = e\.target\.closest\('tr\[data-sid\]'\);[\s\S]*?if \(isMobile\(\)\) return;/);
    assert.match(interacoes, /el\('seldup'\)\.hidden = restrito/);
    assert.match(interacoes, /el\('seldel'\)\.hidden = restrito/);
    assert.match(regras, /O mobile tem paridade total com o desktop/);
});

test('conta restrita fica só no Débito, ciclo atual/próximo, somente leitura e sem toolbar', () => {
    assert.match(visoes, /if \(modoSimples\(\)\) return blocoDebito;/);
    assert.ok(visoes.indexOf('if (modoSimples()) return blocoDebito;') < visoes.indexOf('const creditosExibidos = creditosExibidosNoCiclo'));
    assert.match(dadosUi, /const usados = modoRestrito\(\)\s*\n\s*\? \[idxAtual, idxAtual \+ 1\]\.filter\(i => i >= 0 && i < Estado\.ciclos\.length\)/);
    assert.match(dadosUi, /opcoesPeriodoDe = \(modoRestrito\(\) \? '' : '<option value="">Todos<\/option><option value=-1>Backlog'\)/);
    assert.match(interacoes, /el\('rowVis'\)\.hidden = simples;/);
    assert.match(interacoes, /el\('abreNovo'\)\.hidden = simples;/);
    assert.match(interacoes, /el\('toggleSimulacao'\)\.hidden = simples;/);
    assert.match(regras, /só vê o bloco Débito \(sem Crédito\), e só navega entre o ciclo atual e o próximo/);
});
