// Regressão: do ciclo atual em diante, Besteira e Isabella contam como se o teto do ciclo
// fosse gasto por inteiro — uma linha sintética completa o que falta até 100% e entra no
// saldo e em tudo que deriva dele. O teto é individual por ciclo, gravado na linha âncora
// do ciclo em fin_ciclo (migrations 25/26). Roda o código real de domain/shared/finance + a regra de
// categorias de charts.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const graficos = ler('js/charts.js');
const visoes = ler('js/cycle-views.js');
const interacoes = ler('js/interactions.js');
const regras = ler('docs/REGRAS.md');
const migration = ler('migrations/23-limites-categoria-por-ciclo.sql');

// Três ciclos: setembro (passado), outubro (atual) e novembro (futuro).
function carrega(lancamentos, idxHoje = 1) {
    const estado = {
        idxHoje,
        ciclos: [
            { id: 'c:1', cicloId: 1, ini: '2026-09-05', fat: '2026-10-04' },
            { id: 'c:2', cicloId: 2, ini: '2026-10-05', fat: '2026-11-04' },
            { id: 'c:3', cicloId: 3, ini: '2026-11-05', fat: '2026-12-04' },
        ],
        faturas: [],
        lancamentos,
        // fin_ciclo: cada "ciclo" abaixo (ids 1..3) carrega os limite_* da linha da tabela.
        limitesPorCiclo: new Map(lancamentos.filter(l => l.nome === 'Ciclo').map(l => [l.id, { ...l }])),
    };
    const contexto = { Estado: estado, SALDO_DESDE: '2026-01-01', MESES: [], document: { getElementById: () => ({}) }, setTimeout, clearTimeout };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    const inicio = graficos.indexOf('const categoriaContemCompromisso');
    const fim = graficos.indexOf('function dadosCompromissosCiclo(');
    vm.runInContext(graficos.slice(inicio, fim), contexto);
    vm.runInContext('globalThis.r = { previstasDoCiclo, limitesCategoriaDoCiclo, totalBaseDoCiclo };', contexto);
    return contexto.r;
}

// Linhas de fin_ciclo (marcadas "Ciclo" só pra montar o Map acima; v: 0 não altera conta).
const linhasCiclo = [
    { id: 1, nome: 'Ciclo', data: '2026-09-05', v: 0, periodoIdx: 0 },
    { id: 2, nome: 'Ciclo', data: '2026-10-05', v: 0, periodoIdx: 1 },
    { id: 3, nome: 'Ciclo', data: '2026-11-05', v: 0, periodoIdx: 2 },
];
const resumo = linhas => JSON.parse(JSON.stringify(linhas.map(l => [l.nome, l.categ, l.v, l.data])));

test('ciclo sem lançamento: linhas previstas com o teto inteiro, na data de fechamento', () => {
    const r = carrega([...linhasCiclo]);
    assert.deepEqual(resumo(r.previstasDoCiclo(2, [...linhasCiclo])), [
        ['Besteira prevista', 'Besteira', -250, '2026-12-04'],
        ['Isabella prevista', 'Lazer, Isabella', -700, '2026-12-04'],
    ]);
});

test('completa só o que falta até 100% (pago ou aberto), e some quando já passou do teto', () => {
    const base = [
        ...linhasCiclo,
        { id: 10, nome: 'Café', categ: 'Besteira', v: -100, pago: true, cred: false, periodoIdx: 1 },
        { id: 11, nome: 'Lanche', categ: 'Besteira', v: -50, pago: false, cred: false, periodoIdx: 1 },
        { id: 12, nome: 'Cinema', categ: 'Lazer, Isabella', v: -800, pago: true, cred: false, periodoIdx: 1 },
        // Isabella sozinha não conta no teto dela (regra existente).
        { id: 13, nome: 'Presente', categ: 'Isabella', v: -300, pago: true, cred: false, periodoIdx: 1 },
    ];
    const r = carrega(base);
    assert.deepEqual(resumo(r.previstasDoCiclo(1, base)), [['Besteira prevista', 'Besteira', -100, '2026-11-04']]);
});

test('crédito conta pela prévia (fatura do ciclo seguinte), como o indicador', () => {
    const base = [
        ...linhasCiclo,
        { id: 20, nome: 'Café', categ: 'Besteira', v: -60, pago: true, cred: true, periodoIdx: 2 },   // fatura de novembro
    ];
    const r = carrega(base);
    assert.equal(r.previstasDoCiclo(1, base)[0].v, -190);   // outubro: 250 − 60 da prévia
});

test('ciclo passado não ganha previsão', () => {
    const r = carrega([...linhasCiclo]);
    assert.equal(r.previstasDoCiclo(0, [...linhasCiclo]).length, 0);
});

test('teto individual por ciclo, salvo em fin_ciclo; vazio volta ao padrão', () => {
    const base = [{ ...linhasCiclo[0] }, { ...linhasCiclo[1], limite_besteira: 400, limite_isabella: '0' }, { ...linhasCiclo[2], limite_besteira: null }];
    const r = carrega(base);
    assert.deepEqual({ ...r.limitesCategoriaDoCiclo(1) }, { besteira: 400, isabella: 0 });
    assert.deepEqual({ ...r.limitesCategoriaDoCiclo(2) }, { besteira: 250, isabella: 700 });
    // Teto zero: nada previsto pra Isabella naquele ciclo.
    assert.deepEqual(resumo(r.previstasDoCiclo(1, base)), [['Besteira prevista', 'Besteira', -400, '2026-11-04']]);
});

test('entra no saldo do ciclo (totalBaseDoCiclo), base de Aporte/Resgate e de tudo que deriva', () => {
    const base = [...linhasCiclo, { id: 30, nome: 'Salário', categ: 'Renda', v: 5000, pago: true, cred: false, periodoIdx: 2 }];
    const r = carrega(base);
    // 5000 − 250 − 700.
    assert.equal(r.totalBaseDoCiclo(2, base, {}, () => 0), 4050);
});

test('Débito, saldo diário, Comparar, evolução e pizza usam as mesmas linhas previstas', () => {
    assert.match(visoes, /const linhasPrevistas = previstasDoCiclo\(i, visiveis\);/);
    assert.match(visoes, /\.\.\.linhasFatura, \.\.\.linhasPrevistas\]/);
    assert.match(visoes, /sinteticas\.push\(\.\.\.previstasDoCiclo\(idx, visiveis\)\);/);
    assert.match(ler('js/finance.js'), /previstasDoCiclo\(idx, base\)\.forEach\(p => previstas\.push/);
    assert.match(graficos, /previstasDoCiclo\(i, base\)\.forEach\(p => linhasDe\.Gasto\.push\(p\)\);/);
    assert.match(graficos, /\.\.\.previstasDoCiclo\(idxPeriodo, visiveis\),/);
    assert.match(ler('js/domain.js'), /const PREFIXO_LINHA_SINTETICA = \/\^\(fat\|cp\|sal\|res\|sug\|abt\|prev\):\/;/);
});

test('teto editável no título do ciclo atual e seguintes; grava em fin_ciclo, vazio = padrão', () => {
    assert.match(visoes, /data-limite-categoria="\$\{limite\.chave\}" data-ciclo="\$\{i\}"/);
    assert.match(visoes, /const tetoDoIndicador = limite => \{\s*\n\s*if \(modoRestrito\(\)\) return brl\(limite\.teto\);/);
    assert.match(interacoes, /if \(input\.dataset\.limiteCategoria\) return input\.dataset\.limiteCategoria === 'isabella' \? 'limite_isabella' : 'limite_besteira';/);
    assert.match(interacoes, /const valor = texto \? Math\.round\(numeroDoLimiteDigitado\(texto\) \* 100\) \/ 100 : null;/);
    assert.match(interacoes, /const gravada = !Estado\.simulando \? await salvarLimiteDoCiclo\(cicloId, campo, valor\) : null;/);
    assert.match(interacoes, /Estado\.limitesPorCiclo\.set\(cicloId, gravada \|\| \{ \.\.\.salvos, \[campo\]: valor \}\);/);
    assert.match(interacoes, /if \(input\) confirmarLimiteDoCiclo\(input\);/);
});

test('migration 23 só adiciona colunas nulas e não negativas na própria fin', () => {
    assert.match(migration, /add column if not exists limite_besteira numeric\(12, 2\);/);
    assert.match(migration, /add column if not exists limite_isabella numeric\(12, 2\);/);
    assert.match(migration, /check \(limite_besteira is null or limite_besteira >= 0\)/);
    assert.match(migration, /check \(limite_isabella is null or limite_isabella >= 0\)/);
    assert.doesNotMatch(migration, /^\s*(create table|create policy|grant)\b/im);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Do ciclo atual em diante, Besteira e Isabella contam como se o teto do ciclo fosse gasto por inteiro/);
    assert.match(regras, /`migrations\/23-limites-categoria-por-ciclo\.sql`/);
});
