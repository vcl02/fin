// Contrato de simulação: edição e ocultação locais jamais chamam escrita no Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');

test('simulação mantém update e exclusão de linhas reais somente em memória', () => {
    assert.match(formulario, /const exclusaoEhSimulada = r => Estado\.simulando \|\| r\._sim;/);
    assert.match(formulario, /if \(!simulada\) await excluirLancamento\(r\.id\);/);
    assert.match(formulario, /Ocultar .* só nesta simulação/);
    assert.match(formulario, /Volta ao recarregar ou sair da simulação/);
    assert.equal((interacoes.match(/!Estado\.simulando && !r\._sim\) await atualizarLancamento/g) || []).length, 3);
    assert.match(graficos, /if \(Estado\.simulando \|\| r\._sim\)/);
});

test('ajuste materializado na simulação vira linha local', () => {
    assert.match(formulario, /if \(Estado\.simulando\) \{\s+simulaLancamentoParcelado/);
    assert.match(interacoes, /Estado\.simulando \? 'Simular' :/);
});
