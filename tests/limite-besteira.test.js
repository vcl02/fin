// Regressão: indicador de limite de "Besteira" no título Débito do ciclo atual — soma
// Débito e Crédito do mesmo periodoIdx contra um único teto fixo em código.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const dominio = fs.readFileSync('js/domain.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('teto fixo em código, não editável pela tela', () => {
    assert.match(dominio, /const CATEGORIA_BESTEIRA = 'Besteira';/);
    assert.match(dominio, /const LIMITE_BESTEIRA = 250;/);
});

function carregaDadosLimiteBesteiraDoCiclo() {
    const inicio = graficos.indexOf('const categoriaContemCompromisso');
    const fim = graficos.indexOf('function dadosCompromissosCiclo(');
    if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de limite de Besteira.');
    const contexto = {
        CATEGORIA_BESTEIRA: 'Besteira', LIMITE_BESTEIRA: 250,
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        ehTransferenciaFatura: r => String(r.categ || '').toLowerCase().includes('antecipação fatura'),
    };
    vm.createContext(contexto);
    vm.runInContext(`${graficos.slice(inicio, fim)}\nglobalThis.dadosLimiteBesteiraDoCiclo = dadosLimiteBesteiraDoCiclo;`, contexto);
    return contexto.dadosLimiteBesteiraDoCiclo;
}

test('soma Débito e Crédito do mesmo ciclo contra o teto único, separando pago de total', () => {
    const dadosLimiteBesteiraDoCiclo = carregaDadosLimiteBesteiraDoCiclo();
    const linhas = [
        { v: -50, categ: 'Besteira', pago: true, cred: false },     // café pago no débito
        { v: -80, categ: 'Besteira, Lazer', pago: true, cred: true },  // milkshake pago no crédito
        { v: -40, categ: 'Besteira', pago: false, cred: true },     // uber aberto no crédito
        { v: -100, categ: 'Casa', pago: true, cred: false },         // outra categoria: não entra
        { v: 30, categ: 'Besteira', pago: true, cred: false },      // positivo: não é gasto, não entra
    ];
    const resultado = dadosLimiteBesteiraDoCiclo(linhas);
    assert.equal(resultado.valorPago, 130);
    assert.equal(resultado.valorTotal, 170);
    assert.equal(resultado.percentualPago, 52);
    assert.equal(Math.round(resultado.percentualTotal * 10) / 10, 68);
});

test('exclui antecipação de fatura, igual às demais leituras de orçamento', () => {
    const dadosLimiteBesteiraDoCiclo = carregaDadosLimiteBesteiraDoCiclo();
    const resultado = dadosLimiteBesteiraDoCiclo([
        { v: -200, categ: 'Besteira, Antecipação Fatura', pago: true, cred: false },
    ]);
    assert.equal(resultado.valorPago, 0);
    assert.equal(resultado.valorTotal, 0);
});

test('aparece no título Débito só no ciclo atual, combinando debitos e creditosDaFatura', () => {
    assert.match(visoes, /const besteiraDoCiclo = cicloAtual \? dadosLimiteBesteiraDoCiclo\(\[\.\.\.debitos, \.\.\.creditosDaFatura\]\) : null;/);
    assert.match(visoes, /spanBesteira\(besteiraDoCiclo\?\.percentualPago\)/);
    assert.match(visoes, /spanBesteira\(besteiraDoCiclo\?\.percentualTotal\)/);
    assert.match(visoes, /percentual > 100 \? 'vm' : 'vd'/);
});

test('fica visivelmente separado de Saldo/Guardado por um divisor', () => {
    assert.match(estilos, /\.besteiraIndicador\s*\{[\s\S]*?border-left:\s*1px solid var\(--ln\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /um teto fixo em código \(`js\/domain\.js`, hoje R\$ 250, não editável pela tela\)/);
    assert.match(regras, /nunca no histórico nem num ciclo futuro ainda não iniciado/);
});
