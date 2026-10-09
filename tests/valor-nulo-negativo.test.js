// Regressão: lançamento sem valor definido (NULL no banco) deve parecer NEGATIVO na tela,
// nunca neutro/positivo — mesmo pedido valendo pro Backlog e pro resto do sistema. É só
// aparência: o valor gravado continua null até o usuário escolher um número de verdade.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const graficos = fs.readFileSync('js/charts.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Extrai corValorLancamento/celValorLancamento/celValorEditavel do arquivo real e roda num
// contexto isolado, com os poucos globais de que dependem simulados.
function carregaCelulasDeValor() {
    const inicio = compartilhado.indexOf('const valorMonetarioExibivel');
    const fim = compartilhado.indexOf('\n};', compartilhado.indexOf('const celValorEditavel')) + 3;
    if (inicio < 0 || fim < 3) throw Error('Não encontrou as células de valor em shared.js.');
    const contexto = { escapeHtml: v => String(v) };
    vm.createContext(contexto);
    vm.runInContext(`${compartilhado.slice(inicio, fim)}
globalThis.corValorLancamento = corValorLancamento;
globalThis.celValorLancamento = celValorLancamento;
globalThis.celValorEditavel = celValorEditavel;`, contexto);
    return {
        corValorLancamento: contexto.corValorLancamento,
        celValorLancamento: contexto.celValorLancamento,
        celValorEditavel: contexto.celValorEditavel,
    };
}

test('valor NULO (nunca definido) conta como negativo na célula não editável (Backlog incluso, via modoRestrito/linha não real)', () => {
    const { corValorLancamento, celValorLancamento } = carregaCelulasDeValor();
    const semValor = { valor: null, v: 0 };
    assert.equal(corValorLancamento(semValor), 'vm');
    assert.match(celValorLancamento(semValor), /class="n vm"/);
    assert.match(celValorLancamento(semValor), />R\$\s?0,00$/);
});

test('valor realmente zero (não null, gravado assim de propósito) continua neutro, não vira negativo', () => {
    const { corValorLancamento } = carregaCelulasDeValor();
    assert.equal(corValorLancamento({ valor: 0, v: 0 }), '');
});

test('linha sintética (fat:/sal:/res:/sug:/abt:, sem coluna valor de verdade) nunca é forçada a negativo só por não ter "valor"', () => {
    const { corValorLancamento } = carregaCelulasDeValor();
    assert.equal(corValorLancamento({ _sid: 'sal:0', v: 0 }), '');
});

test('valor negativo/positivo de verdade continuam vm/vd normalmente', () => {
    const { corValorLancamento } = carregaCelulasDeValor();
    assert.equal(corValorLancamento({ valor: -50, v: -50 }), 'vm');
    assert.equal(corValorLancamento({ valor: 50, v: 50 }), 'vd');
});

test('célula editável (Débito/Crédito normais): sem valor mostra "−" vermelho, nunca "+" verde', () => {
    const { celValorEditavel } = carregaCelulasDeValor();
    const html = celValorEditavel({ id: 7, valor: null, v: 0 });
    assert.match(html, /class="n vm"/);
    assert.match(html, /class="sinalBt compacto"/);   // sem ' pos': fica vermelho/negativo
    assert.doesNotMatch(html, /class="sinalBt compacto pos"/);
    assert.match(html, />−</);
});

test('célula editável: valor positivo de verdade continua mostrando "+" verde normalmente', () => {
    const { celValorEditavel } = carregaCelulasDeValor();
    const html = celValorEditavel({ id: 7, valor: 50, v: 50 });
    assert.match(html, /class="sinalBt compacto pos"/);
    assert.match(html, />\+</);
});

test('Débito/Crédito (linha não editável) e o detalhamento de categoria do gráfico usam celValorLancamento, não a antiga celValor genérica', () => {
    assert.match(tabelas, /: \(ehLinhaReal\(r\) && !modoRestrito\(\) \? celValorEditavel\(r\) : celValorLancamento\(r\)\)/);
    assert.match(graficos, /\$\{celNome\(r\)\}\$\{celValorLancamento\(r\)\}/);
    assert.doesNotMatch(compartilhado, /const celValor = /);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /esse zero conta como negativo na aparência \(texto vermelho, botão de sinal com `−`\), nunca neutro ou verde/);
    assert.match(regras, /Um valor realmente gravado como zero \(não `NULL`\) continua neutro normalmente/);
});
