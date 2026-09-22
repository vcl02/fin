// Contrato de preferências visuais: grafite legível, ações compactas e mobile somente consulta/cadastro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const agentes = fs.readFileSync('AGENTS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const base = fs.readFileSync('css/base.css', 'utf8');
const mobile = fs.readFileSync('css/mobile.css', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');

test('registra o tema grafite, ações por ícone e minimalismo como preferências', () => {
    assert.match(agentes, /dark mode definitivo, porém em tons de cinza escuro legíveis/);
    assert.match(agentes, /Prefira ícones a textos nos botões de ação/);
    assert.match(agentes, /formulários somente com campos necessários/);
    assert.match(decisoes, /tema é sempre escuro, mas em cinza grafite legível/);
    assert.match(base, /--bg: #1B1E21;/);
    assert.match(base, /--pa: #24272B;/);
});

test('mobile não monta ações de atualização nas tabelas', () => {
    assert.match(regras, /No mobile, as tabelas são somente leitura/);
    assert.match(mobile, /#exportarCsv,\s+#backupJson/);
    assert.match(tabelas, /const podeSelecionar = selecionavel && !isMobile\(\);/);
    assert.match(interacoes, /if \(isMobile\(\)\) \{\s+Estado\.selecionados\.clear\(\);/);
    assert.match(graficos, /if \(isMobile\(\)\) return;\s+e\.stopImmediatePropagation\(\);/);
});
