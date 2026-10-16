// Faixas Hoje e Futuro dos títulos: cada item e cada valor/rótulo variável dentro dele
// ganham a largura do maior entre as faixas, pra ficarem um embaixo do outro.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Elemento falso: largura fixa, filhos e consulta por seletor simples (só o que a função usa).
function elemento(largura, { classes = [], internos = [], filhos = [] } = {}) {
    return {
        style: {}, children: filhos, classList: { contains: c => classes.includes(c) },
        getBoundingClientRect: () => ({ width: largura }),
        querySelectorAll: () => internos,
    };
}

function rodar(faixas) {
    const titulo = { querySelectorAll: () => faixas.map(filhos => ({ children: filhos })) };
    const inicio = interacoes.indexOf('function alinharResumosDosTitulos() {');
    const fim = interacoes.indexOf('\n}\n', inicio) + 3;
    const ctx = { el: () => ({ querySelectorAll: () => [titulo] }), Math };
    vm.runInNewContext(`${interacoes.slice(inicio, fim)}\nalinharResumosDosTitulos();`, ctx);
}

test('itens e valores das duas faixas ficam com a largura do maior', () => {
    const livreHoje = elemento(70), livreFuturo = elemento(55);
    const rotuloHoje = elemento(30), rotuloFuturo = elemento(38);   // "Livre" × "Acima"
    const hoje = [elemento(200, { internos: [rotuloHoje, livreHoje] }), elemento(100)];
    const futuro = [elemento(180, { internos: [rotuloFuturo, livreFuturo] }), elemento(120)];
    const meta = elemento(90, { classes: ['resumoMeta'] });
    rodar([hoje, [...futuro, meta]]);
    // Só o mais estreito de cada par ganha largura mínima; o maior fica como está.
    assert.equal(livreHoje.style.minWidth, undefined);
    assert.equal(livreFuturo.style.minWidth, '70px');
    assert.equal(rotuloFuturo.style.minWidth, undefined);
    assert.equal(rotuloHoje.style.minWidth, '38px');
    assert.equal(hoje[0].style.minWidth, undefined);
    assert.equal(futuro[0].style.minWidth, '200px');
    assert.equal(hoje[1].style.minWidth, '120px');
    // "N registros" fica fora do alinhamento.
    assert.equal(meta.style.minWidth, undefined);
});

test('faixas com estrutura diferente não são mexidas', () => {
    const hoje = [elemento(200), elemento(100)];
    const futuro = [elemento(180)];
    rodar([hoje, futuro]);
    assert.equal(hoje[0].style.minWidth, undefined);
});

test('alinhamento roda a cada desenho; Crédito reserva o lugar do valor da fatura', () => {
    assert.match(interacoes, /el\('out'\)\.innerHTML = modoBlocos \? vCiclo\(\) : vComp\(\);\s*\n\s*alinharResumosDosTitulos\(\);/);
    assert.match(visoes, /\(faturaHoje \|\| \(exibeFuturoCredito && faturaFuturo \? celulaReservada : ''\)\)/);
    assert.match(visoes, /\(faturaFuturo \|\| \(temHoje && faturaHoje \? celulaReservada : ''\)\)/);
    assert.match(estilos, /\.resumoDados \{[\s\S]*?font-variant-numeric: tabular-nums;/);
    assert.match(regras, /cada item fica exatamente embaixo do correspondente da outra faixa/);
});

test('valores das faixas têm tamanho fixo: reais e percentuais reservam a largura do maior possível', () => {
    assert.match(estilos, /\.resumoDados b \{\s*\n\s*display: inline-block;\s*\n\s*min-width: 13ch;\s*\n\s*text-align: right;/);
    assert.match(estilos, /\.resumoDados b\.pct \{\s*\n\s*min-width: 5ch;/);
    assert.match(visoes, /\$\{limite\.rotulo\} <b class="pct \$\{cor\}">/);
    assert.match(regras, /todo valor em reais nas faixas reserva a largura de `-R\$ 99\.999,99` e todo percentual a de `100%`/);
});
