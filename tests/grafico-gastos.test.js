// Pizza de gastos: agrupa despesas reais e evita contar transferência de fatura duas vezes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/charts.js', 'utf8');
const inicio = fonte.indexOf('const PERCENTUAL_MINIMO_PIZZA');
const fim = fonte.indexOf('\n// clique numa celula', inicio);
if (inicio < 0 || fim < 0) throw Error('Não encontrou os dados da pizza de gastos.');

function dadosDoGrafico(lancamentos) {
    const contexto = {
        Estado: { ciclos: [{ fat: '2026-10-12' }], lancamentos },
        ehTransferenciaFatura: r => !r.cred && /antecipação de fatura/i.test(`${r.nome || ''} ${r.categ || ''}`),
        ajusteDoCicloContaUnica: () => null,
        textoOuTraco: valor => String(valor || '-'),
        categoriasSeparadas: valor => String(valor || '').split(',').map(c => c.trim()).filter(Boolean),
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\nglobalThis.regras = { dadosDoGraficoCiclo, categoriasMinimasDaPizza };`, contexto);
    return contexto.regras;
}

test('pizza separa categorias compartilhadas sem incluir crédito ou antecipação', () => {
    const regras = dadosDoGrafico([
        { periodoIdx: 0, cred: false, nome: 'Mercado', categ: 'Casa, Reserva', v: -100 },
        { periodoIdx: 0, cred: false, nome: 'Antecipação de Fatura', categ: 'Fatura', v: -200 },
        { periodoIdx: 0, cred: true, nome: 'Compra cartão', categ: 'Eletrônicos', v: -300 },
    ]);

    const dados = regras.dadosDoGraficoCiclo(0);
    assert.deepEqual(Array.from(dados.categorias), ['Casa', 'Reserva']);
    assert.deepEqual(Array.from(dados.categoriasCompartilhadas), ['Casa', 'Reserva']);
    assert.deepEqual(Array.from(dados.gastos, gasto => ({ categorias: Array.from(gasto.categorias), valor: gasto.valor })), [
        { categorias: ['Casa', 'Reserva'], valor: 100 },
    ]);
});

test('pizza mantém somente categorias de ao menos dois por cento do recorte', () => {
    const regras = dadosDoGrafico([]);
    const resultado = regras.categoriasMinimasDaPizza({ Casa: 96, Pequena: 1.99, Reserva: 2.01 });
    assert.equal(resultado.total, 100);
    assert.deepEqual(Array.from(resultado.categorias), ['Casa', 'Reserva']);
});
