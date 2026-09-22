const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

test('o cadastro começa com Reserva emergência desmarcada', () => {
    const campo = html.match(/<input type=checkbox id=fReservaEmergencia([^>]*)>/);
    assert.ok(campo, 'campo Reserva emergência não encontrado no cadastro');
    assert.doesNotMatch(campo[1], /\bchecked\b/, 'Reserva emergência não pode iniciar marcada');
});

test('o cadastro envia Reserva emergência e o próximo lançamento volta para falso', () => {
    assert.match(script, /const reservaEmergencia = el\('fReservaEmergencia'\)\.checked;/);
    assert.match(script, /reserva_emergencia: reservaEmergencia/);
    assert.match(script, /el\('fReservaEmergencia'\)\.checked = false;/);
});

test('o badge Reserva emergência alterna e persiste somente a própria linha', () => {
    assert.match(script, /data-tog-reserva-emergencia=/);
    assert.match(script, /atualizarLancamento\(r\.id, \{ reserva_emergencia: novaReservaEmergencia \}\)/);
    assert.match(script, /if \(e\.target\.closest\('\[data-tog-reserva-emergencia\]'\)\) return;/);
});
