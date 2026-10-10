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

test('um lançamento ainda taggeado com a categoria descontinuada "Besteira Isabella" conta pro teto Besteira solo (substring), não pro teto Isabella (falta "Lazer")', () => {
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

test('indicador Isabella (por enquanto) soma SÓ "Lazer"+"Isabella" juntas; "Isabella" sozinha nunca conta, nem presente/mimo nem compromisso fixo (parcela, reserva, fatura)', () => {
    const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } = carregaDadosLimiteCategoriaDoCiclo();
    const linhas = [
        { v: -80, categ: 'Lazer, Isabella', pago: true, cred: false },         // comeram/saíram juntos: conta
        { v: -60, categ: 'Isabella', pago: false, cred: true },                // presente/mimo pra ela: não conta mais
        { v: -40, categ: 'Isabella, Fatura', pago: true, cred: false },        // fatura detalhada real do cartão dela: não conta
        { v: -25, categ: 'Isabella, Comprometido', pago: true, cred: false },  // compromisso fixo (parcela, reserva): não conta
        { v: -30, categ: 'Lazer', pago: true, cred: false },                   // sem "Isabella" junto: não conta
        { v: -10, categ: 'Lazer, Presentes', pago: true, cred: false },        // nenhuma com "Isabella": não conta
    ];
    const resultado = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);
    assert.equal(resultado.valorPago, 80);
    assert.equal(resultado.valorTotal, 80);
});

test('aparece no título Débito só no ciclo atual, com o Crédito pela MESMA prévia da tabela Crédito (fatura de i+1)', () => {
    // Igual à regra geral de Crédito ("no ciclo N ela mostra os créditos da competência
    // N+1"): ciclo que começa em outubro conta, no Crédito, o que vai entrar na fatura de
    // novembro — nem pela data da compra, nem pelo periodoIdx cru do lançamento.
    assert.match(visoes, /const linhasDaPreviaNoCiclo = \[\.\.\.debitos, \.\.\.creditosExibidosNoCiclo\(visiveis, i\)\];/);
    assert.match(visoes, /rotulo: 'Besteira', \.\.\.dadosLimiteCategoriaDoCiclo\(linhasDaPreviaNoCiclo, CATEGORIA_BESTEIRA, LIMITE_BESTEIRA\)/);
    assert.match(visoes, /rotulo: 'Isabella', \.\.\.dadosLimiteCategoriaDoCiclo\(linhasDaPreviaNoCiclo, ehGastoIsabella, LIMITE_ISABELLA\)/);
    assert.match(visoes, /spansLimitesCategoria\('percentualPago'\)/);
    assert.match(visoes, /spansLimitesCategoria\('percentualTotal'\)/);
    assert.match(visoes, /limite\[chave\] > 100 \? 'vm' : 'vd'/);
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
    assert.match(regras, /Convenção de categorização \(POR ENQUANTO, pode ser revista\): só `Lazer` \+ `Isabella` combinadas na mesma linha contam pro teto dela/);
    assert.match(regras, /`Isabella` sozinha NÃO conta — nem presente\/mimo pontual, nem compromissos fixos que usam essa tag/);
    assert.match(regras, /`Lazer` sozinho também nunca conta, pois pode ser lazer com qualquer outra pessoa/);
    assert.match(regras, /Besteira \(café, milkshake, lanche sozinho\) é só o teto `Besteira` — nunca combina com `Isabella`/);
    assert.match(regras, /`#ajudaCategorias`, abre `#modalAjudaCategorias`/);

    assert.match(regras, /categoria `Isabella` \(sem `Lazer` junto, então nunca entra no indicador `Isabella`/);
});

test('botão de ajuda ao lado de Categorias abre um guia com as regras de categorização (Besteira solo, Lazer+Isabella) — Isabella sozinha nunca conta', () => {
    assert.match(html, /<button type=button id=ajudaCategorias class=btAjudaMini title="Guia: Besteira, Isabella, Lazer"/);
    assert.match(html, /aria-label="Abrir guia de categorias Besteira, Isabella e Lazer"/);
    assert.match(html, /<dialog id=modalAjudaCategorias>/);
    assert.match(html, /<dt>Besteira<\/dt>/);
    assert.doesNotMatch(html, /<dt>Besteira Isabella<\/dt>/);
    assert.doesNotMatch(html, /<dt>Presentes \+ Isabella<\/dt>/);
    assert.doesNotMatch(html, /<dt>Isabella \(sozinha\)<\/dt>/);
    assert.match(html, /<dt>Lazer \+ Isabella<\/dt>/);
    assert.match(html, /Por enquanto, "Isabella" sozinha NUNCA entra nesse teto/);

    assert.match(formulario, /el\('ajudaCategorias'\)\.onclick = \(\) => el\('modalAjudaCategorias'\)\.showModal\(\);/);
    assert.match(formulario, /el\('fechaAjudaCategorias'\)\.onclick = \(\) => el\('modalAjudaCategorias'\)\.close\(\);/);
    assert.match(formulario, /if \(e\.target == el\('modalAjudaCategorias'\)\) el\('modalAjudaCategorias'\)\.close\(\);/);

    assert.match(estilosForm, /dialog#modalDiagnostico,\s*\n\s*dialog#modalAjudaCategorias \{/);
    assert.match(estilosForm, /\.btAjudaMini\s*\{/);
    assert.match(estilosForm, /\.ajudaCategorias\s*\{/);
});
