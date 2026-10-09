// Regressão: Nome, Categoria e Frequência passam a ser editáveis clicando no próprio texto
// da célula, mesmo esquema de clique-pra-editar do Valor/Data/Pago (UPDATE imediato via
// atualizarLancamento). Clicar em outro ponto da linha continua só selecionando-a.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('Nome, Categoria e Frequência só ficam clicáveis pra linha real fora da conta restrita', () => {
    assert.match(tabelas, /const celCateg = r => ehLinhaReal\(r\) && !modoRestrito\(\)\s*\n\s*\? `<span class="togCateg" data-tog-categ=/);
    assert.match(tabelas, /const celFreq = r => ehLinhaReal\(r\) && !modoRestrito\(\)\s*\n\s*\? `<span class="togFreq" data-tog-freq=/);
    assert.match(tabelas, /data-tog-nome="\$\{escapeHtml\(String\(r\.id\)\)\}"/);
});

test('celulasDaLinha usa celCateg/celFreq nas colunas categ/freq, celNome continua cobrindo Nome', () => {
    assert.match(tabelas, /chave == 'categ' \? celCateg\(r\)/);
    assert.match(tabelas, /chave == 'freq' \? celFreq\(r\)/);
    assert.match(tabelas, /chave == 'nome' \? celNome\(r\)/);
});

test('clique no Nome abre input de texto livre com o mesmo esquema de stopImmediatePropagation', () => {
    assert.match(interacoes, /const span = e\.target\.closest\('\[data-tog-nome\]'\);/);
    assert.match(interacoes, /<input type=text class=inpNome/);
    assert.match(interacoes, /if \(!novo \|\| novo === original\) \{ desenhar\(\); return; \}/);
});

test('clique na Categoria normaliza o texto como o cadastro antes do UPDATE', () => {
    assert.match(interacoes, /const span = e\.target\.closest\('\[data-tog-categ\]'\);/);
    assert.match(interacoes, /<input type=text class=inpCateg/);
    assert.match(interacoes, /const novo = normalizaCategorias\(input\.value\);/);
    assert.match(interacoes, /await atualizarLancamento\(r\.id, \{ categ: novo \}\);/);
});

test('clique na Frequência abre um select travado no vocabulário de RECORRENCIAS, nunca texto livre', () => {
    assert.match(interacoes, /const span = e\.target\.closest\('\[data-tog-freq\]'\);/);
    assert.match(interacoes, /const opcoes = \['', \.\.\.Object\.keys\(RECORRENCIAS\)\];/);
    assert.match(interacoes, /<select class=inpFreq>/);
    assert.match(interacoes, /await atualizarLancamento\(r\.id, \{ freq: novo \|\| null \}\);/);
});

test('cada novo handler para a propagação pra não vazar pra seleção da linha', () => {
    ['data-tog-nome', 'data-tog-categ', 'data-tog-freq'].forEach(atributo => {
        const chave = atributo.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const regex = new RegExp(`e\\.target\\.closest\\('\\[${atributo}\\]'\\);[\\s\\S]{0,400}?e\\.stopImmediatePropagation\\(\\);`);
        assert.match(interacoes, regex, `handler de ${atributo} deveria parar a propagação`);
    });
});

test('estilos cobrem os três novos togs e inputs, reaproveitando o padrão visual existente', () => {
    assert.match(estilos, /\.togData, \.togNome, \.togCateg, \.togFreq \{/);
    assert.match(estilos, /\.inpValor, \.inpNome, \.inpCateg, \.inpFreq \{/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Nome, Categoria e Frequência também editam direto na tabela/);
    assert.match(regras, /Mensal, Semanal, Quinzenal, Semestral, Anual, ou vazio pra "sem recorrência"/);
});
