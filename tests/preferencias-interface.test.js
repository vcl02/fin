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
    assert.match(pagina, /title="Recarregar, voltar ao ciclo atual, limpar filtros e consolidar tudo"/);
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
    // os 4 ícones (Crédito/Pago/Reserva/Comprometido) + o fechar ficam numa linha só (flex),
    // não mais numa grade 2x2 (ver teste do cabeçalho pra essa regra em detalhe).
    assert.match(estilosForm, /\.fmChecks\s*\{\s*\n\s*display:\s*flex;/);
    assert.match(estilosForm, /\.parcelasLinha/);
});

test('título do cadastro é só pra leitor de tela (.srOnly); Crédito/Pago/Reserva/Comprometido e o fechar dividem uma única linha; o sinal fica ao lado do valor', () => {
    // título vira o 1º filho de #formNovo, sem wrapper .modalHead: por ser position:
    // absolute, não participa do flex nem consome gap — não sobra linha vazia por causa dele.
    assert.match(pagina, /<form id=formNovo method=dialog>\s*\n\s*<h2 id=tituloNovo class=srOnly>Novo lançamento<\/h2>/);
    assert.doesNotMatch(pagina, /class=modalHead>\s*\n\s*<h2 id=tituloNovo/);
    // os 4 ícones E o fechar (nessa ordem) ficam juntos na mesma .fmChecks.
    assert.match(pagina, /<div class=fmChecks>\s*\n\s*<label class="fmChk fmChkIco" title="Crédito">/);
    assert.match(pagina, /title="Comprometido">[\s\S]{0,300}<\/label>\s*\n\s*<button type=button id=fechaNovo/);
    assert.doesNotMatch(pagina, /class=modalTituloAcoes>[\s\S]{0,200}id=fCred/);
    assert.match(pagina, /class=moneyLinha>[\s\S]*class=moneyWrap[\s\S]*id=fValor[\s\S]*<\/div>\s*<button type=button id=fSinal/);
    assert.doesNotMatch(pagina, /id=abreCalc|id=modalCalc/);
    assert.doesNotMatch(pagina, /class=moneyPrefix/);
    const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
    assert.match(estilosForm, /\.modalTituloAcoes/);   // continua existindo, usado por outro modal (modalVisualizacao)
    assert.match(estilosForm, /\.moneyLinha/);
    assert.match(pagina, /id=fechaNovo title="Fechar" aria-label="Fechar">\s*<svg/);
    // .fmChecks virou flex row (não mais grid 4 colunas) pra caber o fechar na mesma linha,
    // empurrado pro canto direito por margem automática — continua vermelho/destrutivo,
    // não um 5º ícone igual aos outros.
    assert.match(estilosForm, /\.fmChecks\s*\{\s*\n\s*display:\s*flex;\s*\n\s*align-items:\s*center;\s*\n\s*gap:\s*\.6rem;\s*\n\s*\}/);
    assert.match(estilosForm, /\.fmChecks #fechaNovo\s*\{\s*\n\s*margin-left:\s*auto;\s*\n\s*\}/);
    assert.doesNotMatch(estilosForm, /#formNovo \.modalHead/);
    assert.doesNotMatch(estilosForm, /#formNovo \.modalTituloAcoes/);
    assert.doesNotMatch(estilosForm, /grid-template-columns: repeat\(4, 2\.9rem\)/);
    assert.match(estilosForm, /#fechaNovo\s*\{[\s\S]*background:\s*var\(--red-soft\)/);
    assert.match(regras, /O título "Novo\/Duplicar\/Editar lançamento"\/"Simular compra" \(`#tituloNovo`\) continua existindo e mudando conforme o modo[\s\S]*?mas é só pra leitor de tela \(`\.srOnly`\)/);
    assert.match(regras, /Os quatro ícones Crédito\/Pago\/Reserva\/Comprometido \(`\.fmChecks`\) e o botão de fechar dividem a mesma linha, numa única fileira/);
});

test('cadastro abre sem foco automático no mobile', () => {
    assert.match(formulario, /window\.matchMedia\('\(min-width: 641px\)'\)\.matches/);
});

test('cadastro mantém margem visível em todos os lados no mobile', () => {
    const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
    assert.match(estilosMobile, /dialog#modalNovo\s*\{[\s\S]*width: calc\(100vw - 2rem\);[\s\S]*height: calc\(100dvh - 2rem\);[\s\S]*border-radius: 16px;[\s\S]*margin: 1rem auto;/);
});

test('fatura à vista não repete o rótulo nem o asterisco', () => {
    assert.match(pagina, /id=fFaturasWrap>\s*<span>Fatura<\/span>/);
    assert.match(formulario, /: 'Parcela única'\);/);
    assert.match(formulario, /function nomeFatura\(fatura\) \{\s*return dataBR\(fatura\.vencimento\);/);
});

test('visualizações usam um único dropdown com acompanhamentos fixos', () => {
    assert.match(pagina, /<button type=button id=btVis class=btIcone title="Visualizações" aria-label="Visualizações"\s*\n\s*aria-haspopup=menu aria-expanded=false aria-controls=visMenu>/);
    assert.match(pagina, /<div id=visMenu class=menuIcone role=menu aria-label="Visualizações" hidden><\/div>/);
    assert.doesNotMatch(pagina, /id=visAlvo/);
    assert.doesNotMatch(pagina, /id=visTipo|id=visAlvoRotulo/);
    assert.doesNotMatch(pagina, /id=btVisualizacoes|id=modalVisualizacoes|id=abreVisualizacao|id=voltaVisualizacoes/);
    assert.doesNotMatch(pagina, /id=btRoberta|id=btEmprestimo|id=btIphone/);
    assert.match(graficos, /const OPCOES_VISUALIZACOES/);
    assert.match(graficos, /categoriaContem: 'Roberta'/);
    assert.doesNotMatch(graficos, /function valoresDaVisualizacao|visTipo/);
    assert.match(graficos, /el\('visMenu'\)\.onclick = e => \{/);
    assert.match(regras, /o clique abre um menu próprio logo abaixo dele/);
    assert.match(regras, /seletor é fixo/);
    assert.match(regras, /categoria contendo `Roberta`/);
    assert.match(regras, /Toda visualização usa a mesma regra/);
    // No mobile, a regra de botão não pode apagar a imagem de fundo que desenha a seta do select.
    assert.match(estilosMobile, /\.btFiltro\s*\{[\s\S]*background-color: var\(--field\);/);
    assert.doesNotMatch(estilosMobile, /\.btFiltro\s*\{[\s\S]*?background: var\(--field\);/);
});

test('indicadores financeiros ficam no cabeçalho, entre a navegação e os botões, separados por pipe', () => {
    const acoes = pagina.slice(pagina.indexOf('id=rowVis'));
    assert.ok(acoes.indexOf('id=indicadorReserva') < acoes.indexOf('id=indicadorComprometido'));
    assert.ok(acoes.indexOf('id=indicadorComprometido') < acoes.indexOf('id=indicadorProporcaoReserva'));
    assert.ok(acoes.indexOf('id=indicadorProporcaoReserva') < acoes.indexOf('id=indicadorLiberdade'));
    assert.ok(acoes.indexOf('id=indicadorReserva') < acoes.indexOf('class=indicadorPipe'));
    assert.ok(acoes.indexOf('class=indicadorPipe') < acoes.indexOf('id=indicadorComprometido'));
    // No cabeçalho: depois da navegação de ciclo e antes dos botões de ação.
    const cabecalho = pagina.slice(pagina.indexOf('<div class=head>'), pagina.indexOf('<p class=sub>'));
    assert.ok(cabecalho.indexOf('id=fciclNav') < cabecalho.indexOf('id=rowVis'));
    assert.ok(cabecalho.indexOf('id=rowVis') < cabecalho.indexOf('id=toggleSimulacao'));
    assert.doesNotMatch(pagina.slice(pagina.indexOf('<div class=tool>'), pagina.indexOf('<div id=out>')), /id=rowVis/);
    assert.doesNotMatch(pagina, /id=fpago|id=origem|id=fsit|id=forigem/);
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
    // Bloco compacto de 3 linhas: Reserva | Comprometido, variações, Gastos | Liberdade.
    assert.match(blocoIndicadores, /grid-template-columns:\s*max-content min-content max-content;\s*\n\s*grid-template-rows:\s*auto auto auto/);
    assert.match(estilosPainel, /#variacaoReserva\s*\{\s*grid-column:\s*1;\s*grid-row:\s*2/);
    assert.match(estilosPainel, /#variacaoComprometido\s*\{\s*grid-column:\s*3;\s*grid-row:\s*2/);
    assert.match(estilosPainel, /#indicadorComprometido \+ \.indicadorPipe\s*\{\s*display:\s*none/);
    assert.match(estilosPainel, /#indicadorProporcaoReserva\s*\{\s*grid-column:\s*1;\s*grid-row:\s*3/);
    assert.match(estilosPainel, /#indicadorLiberdade\s*\{\s*grid-column:\s*3;\s*grid-row:\s*3/);
    // Janela estreita: o bloco desce pra uma linha própria, navegação e botões seguem juntos.
    assert.match(estilosPainel, /@media \(max-width: 1250px\) \{\s*\n\s*#rowVis \{\s*\n\s*order: 1;\s*\n\s*flex-basis: 100%;/);
    assert.match(fs.readFileSync('css/base.css', 'utf8'), /\.head \{\s*\n\s*display: flex;\s*\n\s*flex-wrap: wrap;/);
    assert.match(regras, /Os indicadores ficam no cabeçalho, na mesma linha da navegação de ciclo e dos botões de ação/);
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
    // Flag antiga de modo restrito (form com checkbox fIsa) continua fora — essa
    // reintrodução é só a checagem de e-mail, não aquele mecanismo antigo. `reserva` em
    // formulario já não é mais esse flag: é o bit fin.reserva do PRÓPRIO lançamento
    // (reserva de emergência, sem nenhuma relação com a conta — ver migration 22 e
    // tests/comparar-reserva.test.js), reintroduzido de propósito.
    assert.doesNotMatch(pagina, /id=fIsa|id=fReservaEmergencia/);
    assert.doesNotMatch(formulario, /\bisa\b/);
    assert.doesNotMatch(graficos, /data-tog-reserva-emergencia/);
    // A categoria textual "Isabella" (fatura do cartão) é outro conceito: a nota de que
    // "ela" (a categoria) não muda a interface continua valendo, sem relação com a conta.
    assert.match(regras, /A categoria `Isabella` identifica esses lançamentos/);
});

test('mobile tem paridade total: mesmas colunas, edição e ações do desktop', () => {
    assert.match(estado, /const colunasAtivas = idTabela => idTabela === 'bk'\s*\n\s*\? \[COLS\.find\(\(\[chave\]\) => chave === 'prio'\), \.\.\.COLS\.filter\(\(\[chave\]\) => chave !== 'prio'\)\]\s*\n\s*: COLS\.filter\(\(\[chave\]\) => chave !== 'prio'\);/);
    assert.doesNotMatch(estado, /COLS_MOBILE/);
    assert.match(tabelas, /const texto = ehLinhaReal\(r\) && !modoRestrito\(\)\s*\n\s*\? `<span class="togData"/);
    assert.match(tabelas, /: ehLinhaReal\(r\) \? celValorEditavel\(r\) : celValorSomenteLeitura\(r\)\)/);
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
