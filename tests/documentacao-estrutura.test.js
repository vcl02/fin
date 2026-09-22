// Guardrail de documentação: cada camada deve declarar intenção antes da implementação.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function primeiraLinhaSignificativa(arquivo) {
    return (fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).find(linha => linha.trim() !== '') || '').trimStart();
}

function arquivosDaPasta(pasta, extensao) {
    return fs.readdirSync(pasta)
        .filter(nome => nome.endsWith(extensao))
        .map(nome => path.join(pasta, nome));
}

test('código, estilos, migrations e testes começam explicando sua responsabilidade', () => {
    arquivosDaPasta('js', '.js').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^\/\//, `${arquivo} precisa de cabeçalho`));
    arquivosDaPasta('css', '.css').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^\/\*/, `${arquivo} precisa de cabeçalho`));
    arquivosDaPasta('migrations', '.sql').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^--/, `${arquivo} precisa de cabeçalho`));
    arquivosDaPasta('tests', '.test.js').forEach(arquivo =>
        assert.match(primeiraLinhaSignificativa(arquivo), /^\/\//, `${arquivo} precisa de cabeçalho`));
});

test('HTML explica as regiões que o JavaScript altera dinamicamente', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /<!-- Casca de autenticação:/);
    assert.match(html, /<!-- Painel único estático:/);
    assert.match(html, /<!-- Cadastro único para lançamento real e simulado;/);
});
