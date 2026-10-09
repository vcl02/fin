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
    assert.match(dominio, /const CATEGORIA_BESTEIRA_ISABELLA = 'Besteira Isabella';/);
    assert.match(dominio, /const LIMITE_BESTEIRA_ISABELLA = 700;/);
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
        { v: -350, categ: 'Besteira Isabella', pago: true, cred: false },  // legado: exclusão ainda evita dobrar no Besteira solo
        { v: -50, categ: 'Besteira', pago: true, cred: false },
        { v: -120, categ: 'Lazer, Isabella', pago: true, cred: false },
    ];
    const besteira = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250, 'Besteira Isabella');
    const isabella = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);
    assert.equal(besteira.valorPago, 50);
    assert.equal(besteira.percentualPago, 20);
    assert.equal(isabella.valorPago, 120);
    assert.ok(Math.abs(isabella.percentualPago - 120 / 700 * 100) < 1e-9);
});

test('sem o parâmetro de exclusão, a sobreposição de substring de um lançamento legado realmente ocorreria', () => {
    // Confirma a premissa do bug que o 4º parâmetro evita: chamado sem ele, "Besteira
    // Isabella" (categoria descontinuada, mas que pode sobrar em dado antigo) cai dentro de
    // "Besteira" por conter o texto, então contaria no teto solo também.
    const { dadosLimiteCategoriaDoCiclo } = carregaDadosLimiteCategoriaDoCiclo();
    const resultado = dadosLimiteCategoriaDoCiclo([
        { v: -350, categ: 'Besteira Isabella', pago: true, cred: false },
        { v: -50, categ: 'Besteira', pago: true, cred: false },
    ], 'Besteira', 250);
    assert.equal(resultado.valorPago, 400);
});

test('exclui antecipação de fatura, igual às demais leituras de orçamento', () => {
    const { dadosLimiteCategoriaDoCiclo } = carregaDadosLimiteCategoriaDoCiclo();
    const resultado = dadosLimiteCategoriaDoCiclo([
        { v: -200, categ: 'Besteira, Antecipação Fatura', pago: true, cred: false },
    ], 'Besteira', 250);
    assert.equal(resultado.valorPago, 0);
    assert.equal(resultado.valorTotal, 0);
});

test('indicador Isabella soma só "Lazer"+"Isabella" e "Presentes"+"Isabella" juntas — "Besteira Isabella" sozinha (categoria descontinuada) não conta mais', () => {
    const { dadosLimiteCategoriaDoCiclo, ehGastoIsabella } = carregaDadosLimiteCategoriaDoCiclo();
    const linhas = [
        { v: -80, categ: 'Lazer, Isabella', pago: true, cred: false },     // comeram/saíram juntos
        { v: -60, categ: 'Presentes, Isabella', pago: false, cred: true }, // presente pra ela
        { v: -100, categ: 'Besteira Isabella', pago: true, cred: false },  // categoria descontinuada: não conta mais
        { v: -40, categ: 'Isabella', pago: true, cred: false },            // sozinha: fatura do cartão dela, não conta
        { v: -30, categ: 'Lazer', pago: true, cred: false },               // sem "Isabella" junto: não conta
        { v: -20, categ: 'Presentes', pago: true, cred: false },           // sem "Isabella" junto: não conta
        { v: -10, categ: 'Lazer, Presentes', pago: true, cred: false },    // nenhuma com "Isabella": não conta
    ];
    const resultado = dadosLimiteCategoriaDoCiclo(linhas, ehGastoIsabella, 700);
    assert.equal(resultado.valorPago, 80);     // só Lazer+Isabella, pago
    assert.equal(resultado.valorTotal, 140);   // + 60 (Presentes+Isabella, ainda aberto)
});

test('aparece no título Débito só no ciclo atual, com o Crédito pela MESMA prévia da tabela Crédito (fatura de i+1)', () => {
    // Igual à regra geral de Crédito ("no ciclo N ela mostra os créditos da competência
    // N+1"): ciclo que começa em outubro conta, no Crédito, o que vai entrar na fatura de
    // novembro — nem pela data da compra, nem pelo periodoIdx cru do lançamento.
    assert.match(visoes, /const linhasDaPreviaNoCiclo = \[\.\.\.debitos, \.\.\.creditosExibidosNoCiclo\(visiveis, i\)\];/);
    assert.match(visoes, /rotulo: 'Besteira', \.\.\.dadosLimiteCategoriaDoCiclo\(linhasDaPreviaNoCiclo, CATEGORIA_BESTEIRA, LIMITE_BESTEIRA, CATEGORIA_BESTEIRA_ISABELLA\)/);
    assert.match(visoes, /rotulo: 'Isabella', \.\.\.dadosLimiteCategoriaDoCiclo\(linhasDaPreviaNoCiclo, ehGastoIsabella, LIMITE_BESTEIRA_ISABELLA\)/);
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
    assert.match(regras, /o rótulo `Isabella` contra `LIMITE_BESTEIRA_ISABELLA`, R\$ 700/);
    assert.match(regras, /`Besteira Isabella`.*foi descontinuada e substituída por `Lazer`\+`Isabella`/);
    assert.match(regras, /`Lazer` e `Presentes` sozinhos não contam pro teto `Isabella`/);
    assert.match(regras, /precisam vir combinados com a categoria `Isabella` na mesma linha/);
    assert.match(regras, /`Lazer` \+ `Isabella` é qualquer coisa feita junto, inclusive comer ou lanchar juntos/);
    assert.match(regras, /`Presentes` \+ `Isabella` é algo comprado especificamente para ela/);
    assert.match(regras, /categoria distinta usada pelo lançamento real da fatura detalhada do cartão dela/);
    assert.match(regras, /#ajudaCategorias.*abre `#modalAjudaCategorias`/);
});

test('botão de ajuda ao lado de Categorias abre um guia com as 3 regras de categorização (Besteira solo, Lazer+Isabella, Presentes+Isabella)', () => {
    assert.match(html, /<button type=button id=ajudaCategorias class=btAjudaMini title="Guia: Besteira, Isabella, Lazer, Presentes"/);
    assert.match(html, /aria-label="Abrir guia de categorias Besteira, Isabella, Lazer e Presentes"/);
    assert.match(html, /<dialog id=modalAjudaCategorias>/);
    assert.match(html, /<dt>Besteira<\/dt>/);
    assert.doesNotMatch(html, /<dt>Besteira Isabella<\/dt>/);
    assert.match(html, /<dt>Presentes \+ Isabella<\/dt>/);
    assert.match(html, /<dt>Lazer \+ Isabella<\/dt>/);
    assert.match(html, /"Isabella" sozinha, sem nenhuma das combinações acima, nunca entra nesse teto/);

    assert.match(formulario, /el\('ajudaCategorias'\)\.onclick = \(\) => el\('modalAjudaCategorias'\)\.showModal\(\);/);
    assert.match(formulario, /el\('fechaAjudaCategorias'\)\.onclick = \(\) => el\('modalAjudaCategorias'\)\.close\(\);/);
    assert.match(formulario, /if \(e\.target == el\('modalAjudaCategorias'\)\) el\('modalAjudaCategorias'\)\.close\(\);/);

    assert.match(estilosForm, /dialog#modalDiagnostico,\s*\n\s*dialog#modalAjudaCategorias \{/);
    assert.match(estilosForm, /\.btAjudaMini\s*\{/);
    assert.match(estilosForm, /\.ajudaCategorias\s*\{/);
});
