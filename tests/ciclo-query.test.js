// Contrato da URL do ciclo: ciclos únicos usam um mês estável e restaurável; Backlog usa a
// palavra fixa "backlog" (De sozinho, sem par no combo Até).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/data-ui.js', 'utf8');
const inicio = fonte.indexOf('function chaveCicloNaUrl(');
const fim = fonte.indexOf('\n// Fluxo completo de carga', inicio);
const regrasMd = fs.readFileSync('docs/REGRAS.md', 'utf8');

function criarContexto(href, valores = { compDe: '', compAte: '' }, compDeOptions = [{ value: '0' }, { value: '1' }]) {
    const elementos = {
        compDe: { value: valores.compDe, options: compDeOptions },
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

test('?ciclo=backlog restaura o Backlog (De=-1), quando a opção existe no combo', () => {
    const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=backlog',
        { compDe: '', compAte: '' }, [{ value: '-1' }, { value: '0' }, { value: '1' }]);
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, -1);
});

test('?ciclo=backlog não é imposto quando a opção não existe (ex.: conta restrita, sem Backlog no combo)', () => {
    const { contexto, elementos } = criarContexto('https://exemplo.test/?ciclo=backlog', { compDe: '', compAte: '' });
    contexto.regras.aplicarCicloDaUrl();
    assert.equal(elementos.compDe.value, '');   // mantém o padrão seguro, não força nada
});

test('selecionar o Backlog (De=-1) grava ?ciclo=backlog na URL, sem exigir De==Até', () => {
    const { contexto, chamadas } = criarContexto('https://exemplo.test/', { compDe: '-1', compAte: '1' });
    contexto.regras.sincronizarCicloNaUrl();
    assert.equal(chamadas[0][2], '/?ciclo=backlog');
});

test('sair do Backlog pra uma comparação de verdade remove o ?ciclo=backlog da URL', () => {
    const { contexto, chamadas } = criarContexto('https://exemplo.test/?ciclo=backlog', { compDe: '0', compAte: '1' });
    contexto.regras.sincronizarCicloNaUrl();
    assert.equal(chamadas[0][2], '/');
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regrasMd, /`\?ciclo=backlog` para o Backlog \(De sozinho, Até fica desabilitado nesse modo\)/);
    assert.match(regrasMd, /Um `ciclo=backlog` não imposto quando a opção não existe no combo De \(conta restrita nunca tem Backlog\) mantém o ciclo padrão seguro/);
});
