// Contrato de diagnóstico: métricas resumidas no Console e problemas visíveis em modal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const dadosUi = fs.readFileSync('js/data-ui.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');

test('inconsistências usam modal e problemas operacionais usam toast', () => {
    assert.match(html, /<dialog id=modalDiagnostico>/);
    assert.match(html, /id=fechaDiagnostico/);
    assert.match(html, /id=toasts/);
    assert.match(estilos, /dialog#modalDiagnostico/);
    assert.match(estilos, /#toasts/);
    assert.match(dadosUi, /function mostrarDiagnostico/);
    assert.match(dadosUi, /function mostrarToast/);
    assert.match(dadosUi, /Dados para revisar/);
    assert.match(dadosUi, /mostrarToast\('Não foi possível carregar'/);
    assert.match(interacoes, /mostrarToast\('Não foi possível atualizar a visão'/);
});

test('Console recebe uma única linha de métricas e toast avisa carga lenta', () => {
    assert.match(dadosUi, /const LIMIAR_CARGA_LENTA_MS = 1000/);
    assert.match(dadosUi, /console\.info\(`\[diag\] carga \$\{cargaMs\}ms/);
    assert.match(dadosUi, /if \(cargaMs >= LIMIAR_CARGA_LENTA_MS\) mostrarToast\('Carga lenta'/);
    assert.doesNotMatch(dadosUi, /console\.time|console\.timeEnd|load\(\) iniciou|load\(\) terminou/);
    assert.doesNotMatch(dadosUi, /console\.error/);
    assert.doesNotMatch(interacoes, /console\.error/);
    assert.doesNotMatch(api, /console\.warn\('\[diagnóstico\]/);
});
