// Organização documental: regras financeiras em docs e nenhuma dependência do diretório legado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('mantém regras em docs e remove referências ao diretório legado', () => {
    assert.equal(fs.existsSync('docs/REGRAS.md'), true);
    assert.equal(fs.existsSync('REGRAS.md'), false);

    const diretorioLegado = `.${'claude'}`;
    const arquivos = ['AGENTS.md', 'docs/CHECKLIST-PUBLICACAO.md', 'scripts/check-style.mjs'];
    arquivos.forEach(arquivo => {
        const texto = fs.readFileSync(arquivo, 'utf8');
        assert.equal(texto.includes(diretorioLegado), false);
    });
});

test('recomenda apenas extensões opcionais alinhadas ao projeto', () => {
    const recomendacoes = JSON.parse(fs.readFileSync('.vscode/extensions.json', 'utf8')).recommendations;
    assert.deepEqual(recomendacoes, ['editorconfig.editorconfig']);
});
