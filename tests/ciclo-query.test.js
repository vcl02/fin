// Contrato da URL do ciclo: somente ciclos únicos usam um mês estável e restaurável.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/data-ui.js', 'utf8');
const inicio = fonte.indexOf('function chaveCicloNaUrl(');
const fim = fonte.indexOf('\n// Fluxo completo de carga', inicio);

function criarContexto(href, valores = { compDe: '', compAte: '' }) {
    const elementos = {
        compDe: { value: valores.compDe, options: [{ value: '0' }, { value: '1' }] },
        compAte: { value: valores.compAte, options: [{ value: '0' }, { value: '1' }] }
    };
    const url = new URL(href);
    const chamadas = [];
    const janela = {
        location: { href: url.href, pathname: url.pathname, search: url.search, hash: url.hash },
        history: { state: null, replaceState: (...args) => chamadas.push(args) }
    };
    const contexto = {
        Estado: { ciclos: [{ ini: '2026-09-08' }, { ini: '2026-10-08' }] },
        URL,
        URLSearchParams,
        window: janela,
        el: id => elementos[id],
        dataISO: valor => valor
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}; globalThis.regras = { aplicarCicloDaUrl, sincronizarCicloNaUrl };`, contexto);
    return { contexto, elementos, chamadas };
}

test('URL restaura somente um ciclo único pelo mês de início', () => {
    const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=2026-10');
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, 1);
    assert.equal(elementos.compAte.value, 1);
});

test('URL inclui ciclo para De igual a Até e remove ao comparar', () => {
    const unico = criarContexto('https://exemplo.test/', { compDe: '0', compAte: '0' });
    unico.contexto.regras.sincronizarCicloNaUrl();
    assert.equal(unico.chamadas[0][2], '/?ciclo=2026-09');

    const comparar = criarContexto('https://exemplo.test/?ciclo=2026-09', { compDe: '0', compAte: '1' });
    comparar.contexto.regras.sincronizarCicloNaUrl();
    assert.equal(comparar.chamadas[0][2], '/');
});
