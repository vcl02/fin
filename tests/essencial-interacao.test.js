const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

test('o cadastro começa com Essencial desmarcado', () => {
    const campo = html.match(/<input type=checkbox id=fEssencial([^>]*)>/);
    assert.ok(campo, 'campo Essencial não encontrado no cadastro');
    assert.doesNotMatch(campo[1], /\bchecked\b/, 'Essencial não pode iniciar marcado');
});

test('o cadastro envia Essencial e o próximo lançamento volta para falso', () => {
    assert.match(script, /const essencial = el\('fEssencial'\)\.checked;/);
    assert.match(script, /cred, isa, pago, essencial, ativo: true/);
    assert.match(script, /el\('fEssencial'\)\.checked = false;/);
});

test('o badge Essencial alterna e persiste somente a própria linha', () => {
    assert.match(script, /data-tog-essencial=/);
    assert.match(script, /atualizarLancamento\(r\.id, \{ essencial: novoEssencial \}\)/);
    assert.match(script, /if \(e\.target\.closest\('\[data-tog-essencial\]'\)\) return;/);
});
