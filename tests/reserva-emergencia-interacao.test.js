// Contrato de substituição das flags por categorias no front-end e na migration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const api = fs.readFileSync('js/supabase-api.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const migration = fs.readFileSync('migrations/16-classificacoes-em-categorias.sql', 'utf8');

test('front-end não mantém campos nem payloads das flags removidas', () => {
    assert.doesNotMatch(html, /id=fIsa|id=fReservaEmergencia|id=fativo/);
    assert.doesNotMatch(formulario, /\bisa\s*:|\breserva\s*:|\bativo\s*:/);
    assert.doesNotMatch(api, /atualizarReservaEmergenciaPorNome|select=id,nome,reserva/);
    assert.doesNotMatch(tabelas, /data-tog-reserva-emergencia|r\.isa|r\.ativo|r\.reserva/);
});

test('Isabella e Reserva emergência são lidas como categorias', () => {
    assert.match(tabelas, /ehCategoria\(r\.categ, 'Isabella'\)/);
    assert.match(graficos, /ehCategoria\(r\.categ, 'Reserva emergência'\)/);
});

test('migration preserva classificações e remove as três colunas', () => {
    assert.match(migration, /where isa is true/);
    assert.match(migration, /where reserva is true/);
    assert.match(migration, /drop column if exists ativo/);
    assert.match(migration, /drop column if exists isa/);
    assert.match(migration, /drop column if exists reserva/);
});
