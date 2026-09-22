// Contrato de domínio: valida dados carregados sem mutar ou descartar registros históricos.
const assert = require('node:assert/strict');
const test = require('node:test');
const { carregarFuncoes } = require('./helpers/carregar-funcoes');

const dominio = carregarFuncoes('js/domain.js', [
    'validarLancamentosCarregados', 'NOME_ANCORA_CICLO', 'CATEGORIA_INVESTIMENTO',
    'TOLERANCIA_FINANCEIRA', 'PREFIXO_LINHA_SINTETICA',
]);

test('centraliza nomes e tolerância usados pelas regras financeiras', () => {
    assert.equal(dominio.NOME_ANCORA_CICLO, 'Faturamento PJ');
    assert.equal(dominio.CATEGORIA_INVESTIMENTO, 'Investimento');
    assert.equal(dominio.TOLERANCIA_FINANCEIRA, 0.005);
    assert.equal(dominio.PREFIXO_LINHA_SINTETICA.test('sug:4'), true);
});

test('aceita lançamento persistido completo sem avisos', () => {
    const avisos = dominio.validarLancamentosCarregados([{
        id: 10, data: '2026-09-21', valor: '-42.50', nome: 'Mercado', categ: 'Casa',
        cred: false, isa: false, pago: true, ativo: true, reserva: false,
    }]);
    assert.deepEqual(Array.from(avisos), []);
});

test('avisa sobre contrato inválido sem alterar os dados recebidos', () => {
    const entrada = [{ id: 11, data: '21/09/2026', valor: 'abc', nome: '', cred: true, pago: 'sim' }];
    const antes = JSON.stringify(entrada);
    const avisos = dominio.validarLancamentosCarregados(entrada);
    assert.equal(JSON.stringify(entrada), antes);
    assert.ok(avisos.some(aviso => aviso.includes('nome ausente')));
    assert.ok(avisos.some(aviso => aviso.includes('valor não numérico')));
    assert.ok(avisos.some(aviso => aviso.includes('crédito sem fatura vinculada')));
    assert.ok(avisos.some(aviso => aviso.includes('pago precisa ser booleano')));
});

test('aceita referência legada por fatura_id sem tratar id numérico como data', () => {
    const avisos = dominio.validarLancamentosCarregados([{
        id: 12, data: '2026-09-21', valor: -10, nome: 'Compra antiga', categ: 'Casa',
        cred: true, isa: false, pago: false, ativo: true, fatura_id: 8,
    }]);
    assert.deepEqual(Array.from(avisos), []);
});
