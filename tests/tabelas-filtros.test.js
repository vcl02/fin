// Recorte comum das tabelas avaliado sem renderizar ou alterar dados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/tables.js', 'utf8');
const fim = fonte.indexOf('\n// ORDENAÇÃO', 0);
if (fim < 0) throw Error('Não encontrou os filtros de tabela.');

function filtros() {
    const contexto = {
        Estado: { lancamentos: [] },
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(0, fim)}\nglobalThis.regras = { filtrarLancamentos };`, contexto);
    return contexto;
}

function filtroDeTexto() {
    const inicio = fonte.indexOf('function passaFiltroTexto');
    const fim = fonte.indexOf('\n// clique no header', inicio);
    if (inicio < 0 || fim < 0) throw Error('Não encontrou o filtro textual da tabela.');
    const contexto = {
        Estado: { filtroTexto: {} },
        estadoFiltroTexto: id => contexto.Estado.filtroTexto[id] || (contexto.Estado.filtroTexto[id] = {}),
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
        valorMascaraParaNumero: () => 0,
        TOLERANCIA_BUSCA_VALOR: 0.05,
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\nglobalThis.regras = { passaFiltroTexto };`, contexto);
    return contexto;
}

const linhas = [
    { id: 1, pago: true, cred: false, categ: 'Casa', v: -50 },
    { id: 2, pago: false, cred: true, categ: 'Casa, Isabella', v: -80 },
    { id: 3, pago: true, cred: false, categ: 'Isabella', v: 100 },
    { id: 4, pago: true, cred: false, categ: 'Casa', v: 0 },
];

test('não aplica filtro global de pago nem origem', () => {
    const c = filtros();
    c.Estado.lancamentos = linhas;
    assert.deepEqual(Array.from(c.regras.filtrarLancamentos()).map(x => x.id), [1, 2, 3, 4]);
    assert.doesNotMatch(fonte, /fpago|origem|passaFiltroTriEstado/);
});

test('não há mais filtro de titular nem de sinal', () => {
    assert.doesNotMatch(fonte, /el\('titular'\)|el\('fvalor'\)/);
});

test('Categoria aceita ! para inverter uma busca sem diferenciar caixa ou acento', () => {
    const c = filtroDeTexto();
    c.Estado.filtroTexto.debito = { categ: '!cása' };
    assert.deepEqual(
        linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [3],
    );
});

test('! isolado em Categoria não filtra e os outros campos mantêm busca literal', () => {
    const c = filtroDeTexto();
    c.Estado.filtroTexto.debito = { categ: '!' };
    assert.deepEqual(
        linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [1, 2, 3, 4],
    );
    c.Estado.filtroTexto.debito = { nome: '!casa' };
    assert.deepEqual(linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')), []);
});
