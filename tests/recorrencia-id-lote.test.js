// Vezes > 1 (compra parcelada no Crédito, ou várias ocorrências futuras de um Débito
// recorrente) grava o mesmo fin.recorrencia_id em todas as parcelas do lote — a 1ª
// parcela só sabe seu id depois de criada, então recebe um PATCH extra apontando pra si
// mesma, e as demais já nascem com o campo preenchido.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migration15 = fs.readFileSync('migrations/15-recorrencia.sql', 'utf8');

test('lote real: todas as parcelas de uma mesma submissão compartilham recorrencia_id', () => {
    const inicio = formulario.indexOf('async function salvaLancamentoParceladoNoBanco(');
    assert.ok(inicio >= 0, 'não achou salvaLancamentoParceladoNoBanco');
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}', inicio) + 2);
    assert.match(trecho, /let recorrenciaId = null;/);
    assert.match(trecho, /recorrencia_id: recorrenciaId,\s*\n\s*\};/);
    assert.match(trecho, /const linhaCriada = await inserirLancamento\(payload\);/);
    assert.match(trecho, /if \(parcelas > 1 && p === 0\) \{/);
    assert.match(trecho, /recorrenciaId = linhaCriada\.id;/);
    assert.match(trecho, /await atualizarLancamento\(linhaCriada\.id, \{ recorrencia_id: recorrenciaId \}\);/);
});

test('lançamento único (Vezes = 1) nunca grava recorrencia_id, mesmo com Frequência marcada', () => {
    const inicio = formulario.indexOf('async function salvaLancamentoParceladoNoBanco(');
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}', inicio) + 2);
    // com parcelas == 1 o `if (parcelas > 1 && p === 0)` nunca entra, então recorrenciaId
    // nunca deixa de ser null — payload da única parcela grava recorrencia_id: null.
    assert.match(trecho, /if \(parcelas > 1 && p === 0\)/);
});

test('simulação espelha o mesmo critério (parcelas > 1), usando o contador de simulação como id de lote', () => {
    const inicio = formulario.indexOf('function simulaLancamentoParcelado(');
    assert.ok(inicio >= 0, 'não achou simulaLancamentoParcelado');
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}', inicio) + 2);
    assert.match(trecho, /recorrencia_id: parcelas > 1 \? grupoSimulado : null,/);
});

test('coluna é a da migration 15, não uma nova', () => {
    assert.match(migration15, /ADD COLUMN recorrencia_id integer;/);
    assert.match(regras, /fin\.recorrencia_id.*migration 15|migration 15.*fin\.recorrencia_id/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /todas as parcelas do lote gravam o mesmo `recorrencia_id`/);
    assert.match(regras, /nunca grava `recorrencia_id`, mesmo com Frequência marcada/);
});
