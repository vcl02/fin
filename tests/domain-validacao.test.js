// Contrato de domínio: valida dados carregados sem mutar ou descartar registros históricos.
const assert = require('node:assert/strict');
const test = require('node:test');
const { carregarFuncoes } = require('./helpers/carregar-funcoes');

const categoriasSeparadas = valor => {
    const vistas = new Set();
    return String(valor ?? '').split(',')
        .map(categoria => categoria.trim())
        .filter(Boolean)
        .filter(categoria => {
            const chave = categoria.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (vistas.has(chave)) return false;
            vistas.add(chave);
            return true;
        });
};

const dominio = carregarFuncoes('js/domain.js', [
    'validarLancamentosCarregados', 'NOME_ANCORA_CICLO', 'CATEGORIA_INVESTIMENTO',
    'TOLERANCIA_FINANCEIRA', 'PREFIXO_LINHA_SINTETICA',
], { categoriasSeparadas });

test('centraliza nomes e tolerância usados pelas regras financeiras', () => {
    assert.equal(dominio.NOME_ANCORA_CICLO, 'Faturamento PJ');
    assert.equal(dominio.CATEGORIA_INVESTIMENTO, 'Investimento');
    assert.equal(dominio.TOLERANCIA_FINANCEIRA, 0.005);
    assert.equal(dominio.PREFIXO_LINHA_SINTETICA.test('sug:4'), true);
});

test('aceita lançamento persistido completo sem avisos', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 10, data: '2026-09-21', valor: '-42.50', nome: 'Mercado', categ: 'Casa', cred: false, isa: false, pago: true, ativo: true, reserva: false },
        { id: 13, data: '2026-09-22', valor: '-30.00', nome: 'Luz', categ: 'Casa', cred: false, isa: false, pago: false, ativo: true, reserva: false },
    ]);
    assert.deepEqual(Array.from(diagnostico.inconsistencias), []);
    assert.deepEqual(Array.from(diagnostico.avisos), []);
});

test('avisa categoria com uma única ocorrência sem confundir caixa ou acento', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 20, data: '2026-09-21', valor: -10, nome: 'Único', categ: 'Viagem', cred: false, isa: false, pago: false, ativo: true, reserva: false },
        { id: 21, data: '2026-09-21', valor: -10, nome: 'Casa A', categ: 'Casa', cred: false, isa: false, pago: false, ativo: true, reserva: false },
        { id: 22, data: '2026-09-21', valor: -10, nome: 'Casa B', categ: 'cása ', cred: false, isa: false, pago: false, ativo: true, reserva: false },
    ]);
    assert.deepEqual(Array.from(diagnostico.inconsistencias), []);
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Viagem" aparece em apenas um lançamento (id 20).')));
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Casa"')));
});

test('valida cada categoria separada por vírgula', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 30, data: '2026-09-21', valor: -10, nome: 'Mercado A', categ: 'Casa, Mercado', cred: false, isa: false, pago: true, ativo: true, reserva: false },
        { id: 31, data: '2026-09-22', valor: -20, nome: 'Mercado B', categ: 'Mercado, Saúde', cred: false, isa: false, pago: true, ativo: true, reserva: false },
    ]);
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Mercado"')));
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Casa" aparece em apenas um lançamento (id 30).')));
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Saúde" aparece em apenas um lançamento (id 31).')));
});

test('avisa sobre contrato inválido sem alterar os dados recebidos', () => {
    const entrada = [{ id: 11, data: '21/09/2026', valor: 'abc', nome: '', cred: true, pago: 'sim' }];
    const antes = JSON.stringify(entrada);
    const diagnostico = dominio.validarLancamentosCarregados(entrada);
    assert.equal(JSON.stringify(entrada), antes);
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('nome ausente')));
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('valor não numérico')));
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('crédito sem fatura vinculada')));
    assert.ok(diagnostico.inconsistencias.some(aviso => aviso.includes('pago precisa ser booleano')));
});

test('aceita referência legada por fatura_id sem tratar id numérico como data', () => {
    const diagnostico = dominio.validarLancamentosCarregados([{
        id: 12, data: '2026-09-21', valor: -10, nome: 'Compra antiga', categ: 'Casa',
        cred: true, isa: false, pago: false, ativo: true, fatura_id: 8,
    }]);
    assert.ok(!diagnostico.inconsistencias.some(aviso => aviso.includes('crédito sem fatura vinculada')));
});
