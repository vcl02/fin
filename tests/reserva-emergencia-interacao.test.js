const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');

test('o cadastro começa com Reserva emergência desmarcada', () => {
    const campo = html.match(/<input type=checkbox id=fReservaEmergencia([^>]*)>/);
    assert.ok(campo, 'campo Reserva emergência não encontrado no cadastro');
    assert.doesNotMatch(campo[1], /\bchecked\b/, 'Reserva emergência não pode iniciar marcada');
});

test('o cadastro envia Reserva emergência e o próximo lançamento volta para falso', () => {
    assert.match(formulario, /const reservaEmergencia = el\('fReservaEmergencia'\)\.checked;/);
    assert.match(formulario, /reserva_emergencia: reservaEmergencia/);
    assert.match(formulario, /el\('fReservaEmergencia'\)\.checked = false;/);
});

test('o badge Reserva emergência alterna todas as linhas de mesmo nome exato', () => {
    assert.match(tabelas, /data-tog-reserva-emergencia=/);
    assert.match(api, /nome=eq\.\$\{encodeURIComponent\(nome\)\}/);
    assert.match(graficos, /atualizarReservaEmergenciaPorNome\(nome, novaReservaEmergencia\)/);
    assert.match(graficos, /filter\(x => ehLinhaReal\(x\) && x\.nome === nome\)/);
    assert.match(interacoes, /if \(e\.target\.closest\('\[data-tog-reserva-emergencia\]'\)\) return;/);
});
