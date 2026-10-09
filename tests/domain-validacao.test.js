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
    'TOLERANCIA_FINANCEIRA', 'PREFIXO_LINHA_SINTETICA', 'definirLimiteCartao', 'limiteCartaoContratado',
], { categoriasSeparadas });

// "Hoje" (pago sem olhar data, ver REGRAS.md) só faz sentido se o diagnóstico conseguir
// avisar quando um pago cair fora do ciclo atual — por isso esse grupo injeta hojeISO.
const dominioComHoje = carregarFuncoes('js/domain.js', [
    'validarLancamentosCarregados', 'NOME_ANCORA_CICLO',
], { categoriasSeparadas, hojeISO: () => '2026-09-26' });

test('centraliza nomes e tolerância usados pelas regras financeiras', () => {
    assert.equal(dominio.NOME_ANCORA_CICLO, 'Faturamento PJ');
    assert.equal(dominio.CATEGORIA_INVESTIMENTO, 'Investimento');
    assert.equal(dominio.TOLERANCIA_FINANCEIRA, 0.005);
    assert.equal(dominio.PREFIXO_LINHA_SINTETICA.test('sug:4'), true);
});

test('aceita apenas limite contratado não negativo', () => {
    assert.equal(dominio.definirLimiteCartao(4123.456), true);
    assert.equal(dominio.limiteCartaoContratado(), 4123.46);
    assert.equal(dominio.definirLimiteCartao(-1), false);
});

test('aceita lançamento persistido completo sem avisos', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 10, data: '2026-09-21', valor: '-42.50', nome: 'Mercado', categ: 'Casa', cred: false, pago: true },
        { id: 13, data: '2026-09-22', valor: '-30.00', nome: 'Luz', categ: 'Casa', cred: false, pago: false },
    ]);
    assert.deepEqual(Array.from(diagnostico.inconsistencias), []);
    assert.deepEqual(Array.from(diagnostico.avisos), []);
});

test('avisa categoria com uma única ocorrência sem confundir caixa ou acento', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 20, data: '2026-09-21', valor: -10, nome: 'Único', categ: 'Viagem', cred: false, pago: false },
        { id: 21, data: '2026-09-21', valor: -10, nome: 'Casa A', categ: 'Casa', cred: false, pago: false },
        { id: 22, data: '2026-09-21', valor: -10, nome: 'Casa B', categ: 'cása ', cred: false, pago: false },
    ]);
    assert.deepEqual(Array.from(diagnostico.inconsistencias), []);
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Viagem" aparece em apenas um lançamento: "Único" (id 20).')));
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Casa"')));
});

test('valida cada categoria separada por vírgula', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 30, data: '2026-09-21', valor: -10, nome: 'Mercado A', categ: 'Casa, Mercado', cred: false, pago: true },
        { id: 31, data: '2026-09-22', valor: -20, nome: 'Mercado B', categ: 'Mercado, Saúde', cred: false, pago: true },
    ]);
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Categoria "Mercado"')));
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Casa" aparece em apenas um lançamento: "Mercado A" (id 30).')));
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Categoria "Saúde" aparece em apenas um lançamento: "Mercado B" (id 31).')));
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
        cred: true, pago: false, fatura_id: 8,
    }]);
    assert.ok(!diagnostico.inconsistencias.some(aviso => aviso.includes('crédito sem fatura vinculada')));
});

test('avisa quando o mesmo mês de fatura usa mais de um dia de vencimento', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 40, data: '2026-10-05', valor: -90, nome: 'Compra A', categ: 'Casa', cred: true, pago: true, fatura: '2026-10-12' },
        { id: 41, data: '2026-10-06', valor: -50, nome: 'Compra B', categ: 'Casa', cred: true, pago: true, fatura: '2026-10-14' },
        { id: 42, data: '2026-11-05', valor: -90, nome: 'Compra C', categ: 'Casa', cred: true, pago: true, fatura: '2026-11-12' },
    ]);
    assert.ok(diagnostico.avisos.some(aviso => aviso.includes('Fatura de 2026-10 tem vencimento em mais de um dia')));
    assert.ok(!diagnostico.avisos.some(aviso => aviso.includes('Fatura de 2026-11')));
});

test('não avisa de fatura com dia duplicado quando fatura_id legado não é data', () => {
    const diagnostico = dominio.validarLancamentosCarregados([
        { id: 43, data: '2026-10-05', valor: -90, nome: 'Compra A', categ: 'Casa', cred: true, pago: false, fatura_id: 7 },
        { id: 44, data: '2026-10-06', valor: -90, nome: 'Compra B', categ: 'Casa', cred: true, pago: false, fatura_id: 7 },
    ]);
    assert.deepEqual(Array.from(diagnostico.avisos), []);
});

test('avisa pago com data fora do ciclo atual, tanto em débito quanto em crédito', () => {
    const diagnostico = dominioComHoje.validarLancamentosCarregados([
        { id: 1, data: '2026-08-01', nome: 'Faturamento PJ', categ: '', cred: false, pago: true, valor: 1 },
        { id: 2, data: '2026-09-01', nome: 'Faturamento PJ', categ: '', cred: false, pago: true, valor: 1 },
        { id: 3, data: '2026-10-01', nome: 'Faturamento PJ', categ: '', cred: false, pago: true, valor: 1 },
        // dentro do ciclo atual (01/09 a 30/09): não deve avisar
        { id: 50, data: '2026-09-20', valor: -100, nome: 'Mercado', categ: 'Casa', cred: false, pago: true },
        // débito pago com data no ciclo seguinte (a partir de 01/10): deve avisar
        { id: 51, data: '2026-10-10', valor: -250, nome: 'Água', categ: 'Casa', cred: false, pago: true },
        // débito aberto no futuro: não deve avisar (não está pago)
        { id: 52, data: '2026-10-12', valor: -250, nome: 'Água', categ: 'Casa', cred: false, pago: false },
        // crédito confirmado com fatura vencendo no ciclo seguinte: deve avisar
        { id: 53, data: '2026-09-25', valor: -80, nome: 'Compra cartão', categ: 'Casa', cred: true, pago: true, fatura: '2026-10-12' },
    ]);
    assert.equal(diagnostico.avisos.filter(a => a.includes('ciclo futuro')).length, 2);
    assert.ok(diagnostico.avisos.some(a => a.includes('id 51') && a.includes('data em 2026-10-10') && a.includes('ciclo futuro')));
    assert.ok(diagnostico.avisos.some(a => a.includes('id 53') && a.includes('vencimento de fatura em 2026-10-12') && a.includes('ciclo futuro')));
    assert.ok(!diagnostico.avisos.some(a => a.includes('id 50')));
    assert.ok(!diagnostico.avisos.some(a => a.includes('id 52')));
});
