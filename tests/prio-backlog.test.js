// Regressão: coluna "prio" (prioridade de elevação do Backlog), preenchida na mão pelo
// usuário — 1 = mais provável, quanto maior menos chance (ex.: 999). O Backlog ordena por
// ela por padrão; sem valor preenchido conta como a MENOR prioridade (vai pro fim), nunca
// como zero. Edita direto na célula, igual Nome/Categoria/Frequência.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const estado = fs.readFileSync('js/app-state.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migracao = fs.readFileSync('migrations/18-prioridade-elevacao-backlog.sql', 'utf8');

test('coluna prio existe em COLS, numérica', () => {
    assert.match(estado, /\['prio', 'Prio', 'n'\]/);
});

test('Backlog ("bk") ordena por prio por padrão; as demais tabelas continuam por data', () => {
    assert.match(estado, /const estadoOrdenacao = id => Estado\.ordenacaoPorTabela\[id\] \|\| \(Estado\.ordenacaoPorTabela\[id\] = \{ k: id === 'bk' \? 'prio' : 'data', d: 1 \}\);/);
});

// Extrai ordenarLinhas do arquivo real e roda num contexto isolado, com estadoOrdenacao/COLS
// e timestamp simulados.
function criaOrdenarLinhas(colunaOrdenada) {
    const inicio = tabelas.indexOf('function ordenarLinhas(');
    const fim = tabelas.indexOf('\n}', inicio) + 2;
    if (inicio < 0) throw Error('Não encontrou ordenarLinhas em tables.js.');
    const contexto = {
        estadoOrdenacao: () => ({ k: colunaOrdenada, d: 1 }),
        COLS: [['prio', 'Prio', 'n'], ['data', 'Data', 'd'], ['nome', 'Nome', 't']],
        timestamp: s => Date.parse(s) || 0,
    };
    vm.createContext(contexto);
    vm.runInContext(`${tabelas.slice(inicio, fim)}\nglobalThis.ordenarLinhas = ordenarLinhas;`, contexto);
    return contexto.ordenarLinhas;
}

test('ordena por prio crescente, linha sem prio preenchida vai pro FIM (nunca tratada como zero)', () => {
    const ordenarLinhas = criaOrdenarLinhas('prio');
    const linhas = [
        { nome: 'sem prio', prio: null },
        { nome: 'prio 999', prio: 999 },
        { nome: 'prio 1', prio: 1 },
        { nome: 'prio 5', prio: 5 },
    ];
    const ordenadas = Array.from(ordenarLinhas(linhas, 'bk'), r => r.nome);
    assert.deepEqual(ordenadas, ['prio 1', 'prio 5', 'prio 999', 'sem prio']);
});

test('outras tabelas continuam ordenando por data normalmente, ignorando a regra especial de prio', () => {
    const ordenarLinhas = criaOrdenarLinhas('data');
    const linhas = [{ nome: 'b', data: '2026-10-10' }, { nome: 'a', data: '2026-10-01' }];
    const ordenadas = Array.from(ordenarLinhas(linhas, 'db'), r => r.nome);
    assert.deepEqual(ordenadas, ['a', 'b']);
});

test('célula Prio só é clicável pra linha real fora da conta restrita, igual às demais colunas livres', () => {
    assert.match(tabelas, /const celPrio = r => ehLinhaReal\(r\) && !modoRestrito\(\)\s*\n\s*\? `<span class="togPrio" data-tog-prio=/);
    assert.match(tabelas, /chave == 'prio' \? celPrio\(r\) : textoOuTraco\(r\[chave\]\)/);
});

test('clique em Prio abre um <input type=number>, aceita limpar (volta a null) e ignora entrada inválida sem salvar', () => {
    assert.match(interacoes, /const span = e\.target\.closest\('\[data-tog-prio\]'\);/);
    assert.match(interacoes, /<input type=number class=inpPrio/);
    assert.match(interacoes, /if \(bruto !== ''\) \{/);
    assert.match(interacoes, /if \(!Number\.isFinite\(n\)\) \{ desenhar\(\); return; \}/);
    assert.match(interacoes, /await atualizarLancamento\(r\.id, \{ prio: novo \}\);/);
    assert.match(interacoes, /r\.prio = novo;/);
});

test('estilos cobrem .togPrio/.inpPrio reaproveitando o padrão visual das demais colunas livres', () => {
    assert.match(estilos, /\.togData, \.togNome, \.togCateg, \.togFreq, \.togPrio \{/);
    assert.match(estilos, /\.inpValor, \.inpNome, \.inpCateg, \.inpFreq, \.inpPrio \{/);
});

test('migration versionada adiciona a coluna, não aplicada automaticamente (mantenedor roda manualmente)', () => {
    assert.match(migracao, /^-- /);
    assert.match(migracao, /alter table public\.fin\s*\nadd column prio integer;/);
    assert.match(migracao, /notify pgrst, 'reload schema';/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /`fin\.prio` guarda a prioridade de elevação do Backlog pra um ciclo/);
    assert.match(regras, /1 é o mais provável de entrar num ciclo em breve, quanto maior o número menos a chance/);
    assert.match(regras, /O Backlog ordena por essa coluna por padrão \(menor primeiro\)/);
    assert.match(regras, /Linha sem `prio` preenchida conta como a \*\*menor\*\* prioridade possível/);
});
