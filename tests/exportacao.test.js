// Regressão de backup local: campos estáveis, CSV brasileiro e marcação de simulação.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { extrairTrecho } = require('./helpers/carregar-funcoes');

const fonte = fs.readFileSync('js/export.js', 'utf8');
const dominio = fs.readFileSync('js/domain.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const contexto = { CAMPOS_EXPORTACAO_LANCAMENTO: ['id', 'data', 'valor', 'nome', 'categ', 'freq', 'cred', 'isa', 'pago', 'ativo', 'fatura', 'reserva'] };
vm.createContext(contexto);
vm.runInContext(`${extrairTrecho(fonte, 'const escaparCsv', "\nel('exportarCsv')")}\nglobalThis.funcoes = { escaparCsv, dadosExportaveis, montarCsvLancamentos, nomeArquivoExportacao };`, contexto);
const funcoes = contexto.funcoes;

test('backup guarda somente campos estáveis e identifica simulação', () => {
    const [linha] = funcoes.dadosExportaveis([{ id: 'sim-1', data: '2026-09-21', valor: -20, nome: 'Teste', pago: false, _sim: true, periodoIdx: 9 }]);
    assert.equal(linha.simulado, true);
    assert.equal(linha.periodoIdx, undefined);
    assert.deepEqual(Object.keys(linha), [...contexto.CAMPOS_EXPORTACAO_LANCAMENTO, 'simulado']);
});

test('CSV usa BOM, ponto e vírgula e escapa aspas para planilhas brasileiras', () => {
    const csv = funcoes.montarCsvLancamentos([{ id: 1, data: '2026-09-21', valor: -12.5, nome: '"Mercado"', categ: 'Casa', pago: true }]);
    assert.ok(csv.startsWith('\ufeffid;data;valor'));
    assert.match(csv, /"""Mercado"""/);
    assert.match(csv, /;"false"$/);
});

test('nome de arquivo deixa claro que o backup representa o recorte filtrado', () => {
    contexto.hojeISO = () => '2026-09-22';
    assert.equal(funcoes.nomeArquivoExportacao('json'), 'fin-lancamentos-filtrados-2026-09-22.json');
});

test('ações de exportação usam ícones com rótulos acessíveis', () => {
    assert.match(html, /id=exportarCsv class=btIconeCabecalho title="Exportar lançamentos filtrados em CSV"\s+aria-label="Exportar CSV">\s+<svg/);
    assert.match(html, /id=backupJson class=btIconeCabecalho title="Fazer backup dos lançamentos filtrados em JSON"\s+aria-label="Fazer backup JSON">\s+<svg/);
    assert.doesNotMatch(html, /id=exportarCsv[^>]*>CSV<\/button>/);
    assert.doesNotMatch(html, /id=backupJson[^>]*>Backup<\/button>/);
});
