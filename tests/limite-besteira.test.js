// Regressão: indicadores de limite por categoria (Besteira, Isabella) no título Débito do
// ciclo atual — somam Débito e Crédito do mesmo ciclo (pela DATA da compra) contra um teto
// fixo em código, cada um com o seu.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const dominio = fs.readFileSync('js/domain.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');

test('cada categoria tem seu teto fixo em código, não editável pela tela', () => {
    assert.match(dominio, /const CATEGORIA_BESTEIRA = 'Besteira';/);
    assert.match(dominio, /const LIMITE_BESTEIRA = 250;/);
    assert.match(dominio, /const LIMITE_ISABELLA = 700;/);
    assert.doesNotMatch(dominio, /CATEGORIA_BESTEIRA_ISABELLA/);
});

// Extrai dadosLimiteCategoriaDoCiclo E ehGastoIsabella do arquivo real (não reescreve a
// regra à mão) e roda num contexto isolado, com os globais de que dependem simulados.
function carregaDadosLimiteCategoriaDoCiclo() {
    const inicio = graficos.indexOf('const categoriaContemCompromisso');
    const fim = graficos.indexOf('function dadosCompromissosCiclo(');
    if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de limite por categoria.');
    const contexto = {
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        ehTransferenciaFatura: r => String(r.categ || '').toLowerCase().includes('antecipação fatura'),
        categoriasSeparadas: valor => String(valor ?? '').split(',').map(c => c.trim()).filter(Boolean),
    };
    vm.createContext(contexto);
    vm.runInContext(`${graficos.slice(inicio, fim)}
globalThis.dadosLimiteCategoriaDoCiclo = dadosLimiteCategoriaDoCiclo;
globalThis.ehGastoIsabella = ehGastoIsabella;`, contexto);
    return { dadosLimiteCategoriaDoCiclo: contexto.dadosLimiteCategoriaDoCiclo, ehGastoIsabella: contexto.ehGastoIsabella };
}

test('soma Débito e Crédito do mesmo ciclo contra o teto da categoria, separando pago de total', () => {
    const { dadosLimiteCategoriaDoCiclo } = carregaDadosLimiteCategoriaDoCiclo();
    const linhas = [
        { v: -50, categ: 'Besteira', pago: true, cred: false },     // café pago no débito
        { v: -80, categ: 'Besteira, Lazer', pago: true, cred: true },  // milkshake pago no crédito
        { v: -40, categ: 'Besteira', pago: false, cred: true },     // uber aberto no crédito
        { v: -100, categ: 'Casa', pago: true, cred: false },         // outra categoria: não entra
        { v: 30, categ: 'Besteira', pago: true, cred: false },      // positivo: não é gasto, não entra
    ];
    const resultado = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250);
    assert.equal(resultado.valorPago, 130);
    assert.equal(resultado.valorTotal, 170);
    assert.equal(resultado.percentualPago, 52);
    assert.equal(Math.round(resultado.percentualTotal * 10) / 10, 68);
});

test('Besteira solo e Isabella usam cada um o próprio limite, sem misturar com outro', () => {
    const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } = carregaDadosLimiteCategoriaDoCiclo();
    const linhas = [
        { v: -50, categ: 'Besteira', pago: true, cred: false },
        { v: -120, categ: 'Lazer, Isabella', pago: true, cred: false },
    ];
    const besteira = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250);
    const isabella = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);
    assert.equal(besteira.valorPago, 50);
    assert.equal(besteira.percentualPago, 20);
    assert.equal(isabella.valorPago, 120);
    assert.ok(Math.abs(isabella.percentualPago - 120 / 700 * 100) < 1e-9);
});

test('um lançamento ainda taggeado com a categoria descontinuada "Besteira Isabella" conta pro teto Besteira solo (substring), não pro teto Isabella (não é o item "Isabella")', () => {
    const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } = carregaDadosLimiteCategoriaDoCiclo();
    const linhas = [{ v: -350, categ: 'Besteira Isabella', pago: true, cred: false }];
    const besteira = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250);
    const isabella = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);
    assert.equal(besteira.valorPago, 350);
    assert.equal(isabella.valorPago, 0);
});

test('exclui antecipação de fatura, igual às demais leituras de orçamento', () => {
    const { dadosLimiteCategoriaDoCiclo } = carregaDadosLimiteCategoriaDoCiclo();
    const resultado = dadosLimiteCategoriaDoCiclo([
        { v: -200, categ: 'Besteira, Antecipação Fatura', pago: true, cred: false },
    ], 'Besteira', 250);
    assert.equal(resultado.valorPago, 0);
    assert.equal(resultado.valorTotal, 0);
});

test('indicador Isabella soma tudo com a categoria Isabella (com Lazer ou sozinha), menos a fatura do cartão dela', () => {
    const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } = carregaDadosLimiteCategoriaDoCiclo();
    const linhas = [
        { v: -80, categ: 'Lazer, Isabella', pago: true, cred: false },               // saíram juntos: conta
        { v: -60, categ: 'Isabella', pago: false, cred: true },                      // presente/mimo: conta
        { v: -25, categ: 'Isabella, Comprometido', pago: true, cred: false },        // parcela pra ela: conta
        { v: -40, categ: 'Isabella, Fatura', pago: true, cred: false },              // fatura do cartão dela: fica de fora
        { v: -900, nome: 'Fatura Isabella', categ: 'Isabella', pago: false, cred: false },  // idem, pelo nome
        { v: -30, categ: 'Lazer', pago: true, cred: false },                         // sem Isabella: não conta
        { v: -10, categ: 'Lazer, Presentes', pago: true, cred: false },
    ];
    const resultado = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);
    assert.equal(resultado.valorPago, 105);
    assert.equal(resultado.valorTotal, 165);
});

test('aparece no título Débito só no ciclo atual, com o Crédito pela MESMA prévia da tabela Crédito (fatura de i+1)', () => {
    // Igual à regra geral de Crédito ("no ciclo N ela mostra os créditos da competência
    // N+1"): ciclo que começa em outubro conta, no Crédito, o que vai entrar na fatura de
    // novembro — nem pela data da compra, nem pelo periodoIdx cru do lançamento.
    // A compra prevista (_prev) é justamente o que falta até o teto: nunca entra no indicador.
    assert.match(visoes, /const linhasDaPreviaNoCiclo = \[\.\.\.debitos, \.\.\.creditosExibidosNoCiclo\(visiveis, i\)\]\.filter\(r => !r\._prev\);/);
    assert.match(visoes, /rotulo: 'Besteira', teto: tetosDoCiclo\.besteira, \.\.\.dadosLimiteCategoriaDoCiclo\(linhasDaPreviaNoCiclo, CATEGORIA_BESTEIRA, tetosDoCiclo\.besteira\)/);
    assert.match(visoes, /rotulo: 'Isabella', teto: tetosDoCiclo\.isabella, \.\.\.dadosLimiteCategoriaDoCiclo\(linhasDaPreviaNoCiclo, ehGastoIsabella, tetosDoCiclo\.isabella\)/);
    assert.match(visoes, /spansLimitesCategoria\('percentualPago'\)/);
    assert.match(visoes, /spansLimitesCategoria\('percentualTotal'\)/);
    assert.match(visoes, /const cor = corDoLimiteCategoria\(limite\[chave\]\);/);
    // Além do %, quanto ainda cabe no teto (Hoje: pago; Futuro: pago + aberto) ou quanto passou.
    assert.match(visoes, /const restante = limite\.teto - \(chave === 'percentualPago' \? limite\.valorPago : limite\.valorTotal\);/);
    assert.match(visoes, /<span class=limiteRotulo>Livre<\/span> <b class="\$\{cor\}">\$\{brl\(Math\.max\(0, restante\)\)\}<\/b>/);
    assert.match(visoes, /<span class=limiteRotulo>Acima<\/span> <b class=vm>\$\{brl\(-restante\)\}<\/b>/);
    // Teto do próprio ciclo (linha âncora) e indicador do ciclo atual em diante.
    assert.match(visoes, /const tetosDoCiclo = limitesCategoriaDoCiclo\(i\);/);
    assert.match(visoes, /const limitesCategoria = Estado\.idxHoje >= 0 && i >= Estado\.idxHoje \? \[/);
});

test('fica visivelmente separado de Saldo/Guardado por um divisor', () => {
    assert.match(estilos, /\.besteiraIndicador\s*\{[\s\S]*?border-left:\s*1px solid var\(--ln\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /cada um com seu próprio teto fixo em código \(`js\/domain\.js`, não editável pela tela\)/);
    assert.match(regras, /nunca no histórico nem num ciclo futuro ainda não iniciado/);
    assert.match(regras, /`creditosExibidosNoCiclo`, fatura de `i\+1`/);
    assert.match(regras, /ciclo que começa em outubro conta, no Crédito, o que vai entrar na fatura de novembro/);
    assert.match(regras, /o rótulo `Isabella` contra `LIMITE_ISABELLA`, R\$ 700/);
    assert.match(regras, /`Besteira Isabella`.*foi descontinuada e substituída por `Lazer`\+`Isabella`/);
    assert.match(regras, /não há mais rastro dela em código/);
    assert.match(regras, /Convenção de categorização: todo lançamento com a categoria `Isabella` \(comparada como item inteiro da lista de categorias\) conta pro teto dela/);
    assert.match(regras, /Fica de fora só a fatura do cartão dela: lançamento com `Fatura` na categoria ou no nome/);
    assert.match(regras, /`Lazer` sozinho nunca conta, pois pode ser lazer com qualquer outra pessoa/);
    assert.match(regras, /Besteira \(café, milkshake, lanche sozinho\) é só o teto `Besteira` — nunca combina com `Isabella`/);
    assert.match(regras, /`#ajudaCategorias`, abre `#modalAjudaCategorias`/);

    assert.match(regras, /categoria `Isabella` \(nunca entra no indicador `Isabella`, porque o nome ou a categoria têm `Fatura`/);
});

test('botão de ajuda ao lado de Categorias abre um guia com as regras de categorização (Besteira solo, Isabella) — só a fatura dela fica de fora', () => {
    assert.match(html, /<button type=button id=ajudaCategorias class=btAjudaMini title="Guia: Besteira, Isabella, Lazer"/);
    assert.match(html, /aria-label="Abrir guia de categorias Besteira, Isabella e Lazer"/);
    assert.match(html, /<dialog id=modalAjudaCategorias>/);
    assert.match(html, /<dt>Besteira<\/dt>/);
    assert.doesNotMatch(html, /<dt>Besteira Isabella<\/dt>/);
    assert.doesNotMatch(html, /<dt>Presentes \+ Isabella<\/dt>/);
    assert.match(html, /<dt>Isabella<\/dt>\s*\n\s*<dd>Com "Lazer" junto:[^<]*Sozinha: presente, mimo, parcela pra ela/);
    assert.match(html, /Só a fatura do cartão dela \(categoria ou nome com "Fatura"\) fica fora desse teto\./);

    assert.match(formulario, /el\('ajudaCategorias'\)\.onclick = \(\) => el\('modalAjudaCategorias'\)\.showModal\(\);/);
    assert.match(formulario, /el\('fechaAjudaCategorias'\)\.onclick = \(\) => el\('modalAjudaCategorias'\)\.close\(\);/);
    assert.match(formulario, /if \(e\.target == el\('modalAjudaCategorias'\)\) el\('modalAjudaCategorias'\)\.close\(\);/);

    assert.match(estilosForm, /dialog#modalDiagnostico,\s*\n\s*dialog#modalAjudaCategorias,\s*\n\s*dialog#modalConsolidarTudo \{/);
    assert.match(estilosForm, /\.btAjudaMini\s*\{/);
    assert.match(estilosForm, /\.ajudaCategorias\s*\{/);
});

test('cor do indicador: verde com folga, laranja a partir de 70%, vermelho acima do teto', () => {
    const graficos = fs.readFileSync('js/charts.js', 'utf8');
    const inicio = graficos.indexOf('function corDoLimiteCategoria(');
    const fim = graficos.indexOf('\n}\n', inicio) + 3;
    const contexto = {};
    require('node:vm').createContext(contexto);
    require('node:vm').runInContext(`${graficos.slice(inicio, fim)}\nglobalThis.cor = corDoLimiteCategoria;`, contexto);
    assert.equal(contexto.cor(0), 'vd');
    assert.equal(contexto.cor(69.9), 'vd');
    assert.equal(contexto.cor(70), 'am');
    assert.equal(contexto.cor(100), 'am');
    assert.equal(contexto.cor(100.1), 'vm');
    assert.match(fs.readFileSync('css/dashboard.css', 'utf8'), /\.am \{\s*\n\s*color: #F0A83A;/);
    assert.match(regras, /verde até 70%, laranja de 70% a 100% e vermelho acima do teto/);
    assert.match(regras, /mostra também quanto ainda cabe no teto \(\*\*Livre R\$ …\*\*\) ou, se já passou, \*\*Acima R\$ …\*\*/);
});

test('nome de Besteira e Isabella no título explica o que entra no teto (tooltip)', () => {
    const dominio = fs.readFileSync('js/domain.js', 'utf8');
    const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
    const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
    assert.match(dominio, /const DESCRICAO_LIMITE_CATEGORIA = \{\s*\n\s*besteira: 'Besteira: [^']*café[^']*',\s*\n\s*isabella: 'Isabella: tudo com a categoria Isabella[^']*fatura do cartão dela[^']*',/);
    assert.match(visoes, /<span class=rotuloComDica title="\$\{escapeHtml\(descricao\)\}">\$\{limite\.rotulo\}<\/span>/);
    assert.match(regras, /Passar o mouse no nome \*\*Besteira\*\* ou \*\*Isabella\*\* do indicador mostra o que entra naquele teto/);
});
