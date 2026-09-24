// Contrato de preferências visuais: grafite legível, ações compactas e mobile somente consulta/cadastro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const agentes = fs.readFileSync('AGENTS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const base = fs.readFileSync('css/base.css', 'utf8');
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

test('fatura à vista não repete o rótulo nem o asterisco', () => {
    assert.match(pagina, /id=fFaturasWrap hidden>\s*<span>Fatura<\/span>/);
    assert.match(formulario, /: 'Parcela única';/);
    assert.match(formulario, /function nomeFatura\(fatura\) \{\s*return dataBR\(fatura\.vencimento\);/);
});

test('visualizações usam um seletor único de categoria ou nome', () => {
    assert.match(pagina, /id=btVisualizacoes/);
    assert.match(pagina, /id=visTipo/);
    assert.match(pagina, /id=visAlvo/);
    assert.doesNotMatch(pagina, /id=btRoberta|id=btEmprestimo|id=btIphone/);
    assert.doesNotMatch(graficos, /VIS_CATEGORIAS|dadosCategoria|somenteNegativos|\bop\./);
    assert.match(graficos, /function valoresDaVisualizacao\(campo\)/);
    assert.match(graficos, /Estado\.lancamentos\.flatMap\(r => categoriasSeparadas\(r\.categ\)\)/);
    assert.match(graficos, /Estado\.lancamentos\.map\(r => String\(r\.nome \|\| ''\)\.trim\(\)\)/);
    assert.match(regras, /botão \*\*Visualizações\*\*/);
    assert.match(regras, /Toda visualização usa a mesma regra/);
});

test('ações de acompanhamento ficam na mesma linha em qualquer visão', () => {
    const acoes = pagina.slice(pagina.indexOf('id=rowVis'));
    assert.ok(acoes.indexOf('id=btVisualizacoes') < acoes.indexOf('id=btGrafico'));
    assert.ok(acoes.indexOf('id=btGrafico') < acoes.indexOf('id=btMetaReservaEmergencia'));
    assert.ok(acoes.indexOf('id=btMetaReservaEmergencia') < acoes.indexOf('id=flimpar'));
    assert.match(pagina, /id=fdif[\s\S]*?<\/label>\s*<div id=rowVis>/);
    assert.match(pagina, /id=rowVis[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div id=out>/);
    const estilosPainel = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(estilosPainel, /\.tool > \.row\s*\{[\s\S]*flex-wrap:\s*nowrap/);
    assert.match(estilosPainel, /#rowVis\s*\{[\s\S]*display:\s*flex/);
    assert.match(interacoes, /btMetaReservaEmergencia'\)\.dataset\.idx = el\('compAte'\)\.value/);
    assert.match(interacoes, /if \(modoBlocos\) abrirGraficoGastos/);
    assert.match(interacoes, /else abrirGraficoEvolucao/);
    assert.doesNotMatch(interacoes, /mostraComFade\('(fgraf|fevol|fReserva)'/);
});

test('não há modo Isabella e mobile mantém modo simples sem ações nem bloco Crédito', () => {
    assert.match(regras, /No mobile, as tabelas são somente leitura/);
    assert.match(regras, /ela não muda a interface conforme o e-mail da sessão/);
    assert.match(estado, /const modoSimples = \(\) => matchMedia/);
    assert.doesNotMatch(estado, /restrito|EMAIL_ISABELLA/);
    assert.doesNotMatch(bootstrap, /restrito|EMAIL_ISABELLA|aplicaPerfil/);
    assert.doesNotMatch(pagina, /id=fIsa|id=fReservaEmergencia/);
    assert.doesNotMatch(formulario, /\bisa\b|\breserva\b/);
    assert.doesNotMatch(dadosUi, /modoRestrito/);
    assert.match(dadosUi, /const usadosNaveg = usados;/);
    assert.match(visoes, /if \(modoSimples\(\)\) return blocoDebito;/);
    assert.ok(visoes.indexOf('if (modoSimples()) return blocoDebito;') < visoes.indexOf('const creditosExibidos = creditosExibidosNoCiclo'));
    assert.match(tabelas, /const podeSelecionar = selecionavel;/);
    assert.doesNotMatch(interacoes, /const linha = e\.target\.closest\('tr\[data-sid\]'\);[\s\S]*?if \(isMobile\(\)\) return;/);
    assert.match(interacoes, /el\('seldup'\)\.hidden = mobile/);
    assert.match(interacoes, /el\('seldel'\)\.hidden = mobile/);
    assert.match(regras, /Tocar uma linha seleciona ou desmarca para somar valores/);
    assert.doesNotMatch(graficos, /data-tog-reserva-emergencia/);
});
