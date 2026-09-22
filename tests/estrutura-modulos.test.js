const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const financeiro = fs.readFileSync('js/finance.js', 'utf8');
const tela = fs.readFileSync('script.js', 'utf8');

test('carrega estado, Supabase e interface na ordem necessária', () => {
    const estadoIdx = html.indexOf('./js/app-state.js');
    const apiIdx = html.indexOf('./js/supabase-api.js');
    const financeiroIdx = html.indexOf('./js/finance.js');
    const telaIdx = html.indexOf('./script.js');
    assert.ok(estadoIdx >= 0 && estadoIdx < apiIdx && apiIdx < financeiroIdx && financeiroIdx < telaIdx);
});

test('separa estado e acesso ao banco da camada de interface', () => {
    assert.match(estado, /const Estado =/);
    assert.match(api, /const sb = supabase\.createClient/);
    assert.match(api, /async function carregarDados/);
    assert.match(financeiro, /function saldoDoCiclo/);
    assert.match(financeiro, /function creditosExibidosNoCiclo/);
    assert.doesNotMatch(tela, /const sb = supabase\.createClient/);
    assert.doesNotMatch(tela, /const tokenAtual = async/);
});
