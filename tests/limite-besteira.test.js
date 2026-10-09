// Regressão: indicadores de limite por categoria (Besteira, Fatura Isabella) no título
// Débito do ciclo atual — somam Débito e Crédito do mesmo ciclo (pela DATA da compra)
// contra um teto fixo em código, cada categoria com o seu.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const dominio = fs.readFileSync('js/domain.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('cada categoria tem seu teto fixo em código, não editável pela tela', () => {
    assert.match(dominio, /const CATEGORIA_BESTEIRA = 'Besteira';/);
    assert.match(dominio, /const LIMITE_BESTEIRA = 250;/);
    assert.match(dominio, /const CATEGORIA_FATURA_ISABELLA = 'Fatura Isabella';/);
    assert.match(dominio, /const LIMITE_FATURA_ISABELLA = 700;/);
});

function carregaDadosLimiteCategoriaDoCiclo() {
    const inicio = graficos.indexOf('const categoriaContemCompromisso');
    const fim = graficos.indexOf('function dadosCompromissosCiclo(');
    if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de limite por categoria.');
    const contexto = {
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        ehTransferenciaFatura: r => String(r.categ || '').toLowerCase().includes('antecipação fatura'),
    };
    vm.createContext(contexto);
    vm.runInContext(`${graficos.slice(inicio, fim)}\nglobalThis.dadosLimiteCategoriaDoCiclo = dadosLimiteCategoriaDoCiclo;`, contexto);
    return contexto.dadosLimiteCategoriaDoCiclo;
}

test('soma Débito e Crédito do mesmo ciclo contra o teto da categoria, separando pago de total', () => {
    const dadosLimiteCategoriaDoCiclo = carregaDadosLimiteCategoriaDoCiclo();
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

test('cada categoria usa o próprio limite, sem misturar com outra', () => {
    const dadosLimiteCategoriaDoCiclo = carregaDadosLimiteCategoriaDoCiclo();
    const linhas = [
        { v: -350, categ: 'Fatura Isabella', pago: true, cred: false },
        { v: -50, categ: 'Besteira', pago: true, cred: false },
    ];
    const besteira = dadosLimiteCategoriaDoCiclo(linhas, 'Besteira', 250);
    const faturaIsabella = dadosLimiteCategoriaDoCiclo(linhas, 'Fatura Isabella', 700);
    assert.equal(besteira.valorPago, 50);
    assert.equal(besteira.percentualPago, 20);
    assert.equal(faturaIsabella.valorPago, 350);
    assert.equal(faturaIsabella.percentualPago, 50);
});

test('exclui antecipação de fatura, igual às demais leituras de orçamento', () => {
    const dadosLimiteCategoriaDoCiclo = carregaDadosLimiteCategoriaDoCiclo();
    const resultado = dadosLimiteCategoriaDoCiclo([
        { v: -200, categ: 'Besteira, Antecipação Fatura', pago: true, cred: false },
    ], 'Besteira', 250);
    assert.equal(resultado.valorPago, 0);
    assert.equal(resultado.valorTotal, 0);
});

test('aparece no título Débito só no ciclo atual, combinando debitos com o Crédito pela DATA da compra', () => {
    // Diferente do resto do app: aqui o Crédito entra pela data da compra (periodoDoDebito),
    // não pelo periodoIdx dele (que segue o vencimento da fatura, N+1) — pedido explícito
    // pra refletir quando a compra foi feita, não quando a fatura vence.
    assert.match(visoes, /const creditosPorDataNoCiclo = visiveis\.filter\(r => r\.cred && r\.data && periodoDoDebito\(dataISO\(r\.data\)\) === i\);/);
    assert.match(visoes, /const linhasPorDataNoCiclo = \[\.\.\.debitos, \.\.\.creditosPorDataNoCiclo\];/);
    assert.match(visoes, /rotulo: 'Besteira', \.\.\.dadosLimiteCategoriaDoCiclo\(linhasPorDataNoCiclo, CATEGORIA_BESTEIRA, LIMITE_BESTEIRA\)/);
    assert.match(visoes, /rotulo: 'Fatura Isabella', \.\.\.dadosLimiteCategoriaDoCiclo\(linhasPorDataNoCiclo, CATEGORIA_FATURA_ISABELLA, LIMITE_FATURA_ISABELLA\)/);
    assert.match(visoes, /spansLimitesCategoria\('percentualPago'\)/);
    assert.match(visoes, /spansLimitesCategoria\('percentualTotal'\)/);
    assert.match(visoes, /limite\[chave\] > 100 \? 'vm' : 'vd'/);
});

test('fica visivelmente separado de Saldo/Guardado por um divisor', () => {
    assert.match(estilos, /\.besteiraIndicador\s*\{[\s\S]*?border-left:\s*1px solid var\(--ln\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /cada uma com seu próprio teto fixo em código \(`js\/domain\.js`, não editável pela tela\)/);
    assert.match(regras, /nunca no histórico nem num ciclo futuro ainda não iniciado/);
    assert.match(regras, /`Fatura Isabella` contra `LIMITE_FATURA_ISABELLA`, R\$ 700/);
    assert.match(regras, /categoria distinta da categoria `Isabella` usada pelo lançamento real da fatura detalhada do cartão dela/);
});
