// Vezes > 1 (compra parcelada no Crédito, ou várias ocorrências futuras de um Débito
// recorrente) grava o lote inteiro num único INSERT e depois o mesmo fin.recorrencia_id
// (o id da 1ª parcela, o menor do lote) em todas, num PATCH em lote. Roda a
// salvaLancamentoParceladoNoBanco real com a API simulada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migration15 = fs.readFileSync('migrations/15-recorrencia.sql', 'utf8');

function carregaSalvarLote({ falhaPatch } = {}) {
    const inicio = formulario.indexOf('async function salvaLancamentoParceladoNoBanco(');
    assert.ok(inicio >= 0, 'não achou salvaLancamentoParceladoNoBanco');
    const fim = formulario.indexOf('\n}\n', inicio) + 3;
    const chamadas = { inserts: [], patches: [] };
    const contexto = {
        Estado: { lancamentos: [], ciclos: [] },
        ehAntecipacaoFatura: () => false,
        dataISO: v => v,
        dataDaOcorrencia: (data, p) => `2026-1${p}-15`,
        periodoDaFatura: () => -1,
        periodoDoDebito: () => -1,
        inserirLancamentos: async payloads => {
            chamadas.inserts.push(payloads);
            // o banco devolve fora de ordem de propósito: a 1ª parcela é a de menor id
            return payloads.map((p, i) => ({ ...p, id: 50 + i })).reverse();
        },
        atualizarLancamentos: async (ids, campos) => {
            chamadas.patches.push({ ids, campos });
            if (falhaPatch) throw Error('sem resposta');
        },
    };
    vm.createContext(contexto);
    vm.runInContext(`${formulario.slice(inicio, fim)}\nglobalThis.salvar = salvaLancamentoParceladoNoBanco;`, contexto);
    return { salvar: contexto.salvar, chamadas, Estado: contexto.Estado };
}

const base = { nome: 'Academia', categ: 'Saúde', freq: 'Mensal', data: '2026-10-15', cred: false, pago: true, reserva: false, comprometido: false };

test('lote real: um único INSERT com todas as parcelas e um PATCH em lote com o id da 1ª', async () => {
    const { salvar, chamadas, Estado } = carregaSalvarLote();
    const aviso = await salvar({ ...base, parcelas: 3, valores: [-10, -10, -10] });
    assert.equal(aviso, '');
    assert.equal(chamadas.inserts.length, 1);
    assert.equal(chamadas.inserts[0].length, 3);
    assert.ok(chamadas.inserts[0].every(p => p.recorrencia_id === null));
    assert.deepEqual(Array.from(chamadas.patches[0].ids), [50, 51, 52]);
    assert.equal(chamadas.patches[0].campos.recorrencia_id, 50);
    assert.deepEqual(Estado.lancamentos.map(l => [l.id, l.recorrencia_id]), [[50, 50], [51, 50], [52, 50]]);
});

test('lançamento único (Vezes = 1) nunca grava recorrencia_id, mesmo com Frequência marcada', async () => {
    const { salvar, chamadas } = carregaSalvarLote();
    await salvar({ ...base, parcelas: 1, valores: [-10] });
    assert.equal(chamadas.inserts[0][0].recorrencia_id, null);
    assert.equal(chamadas.patches.length, 0);
});

test('falha só no vínculo de lote vira aviso: as linhas já gravadas aparecem e nada é refeito', async () => {
    const { salvar, chamadas, Estado } = carregaSalvarLote({ falhaPatch: true });
    const aviso = await salvar({ ...base, parcelas: 2, valores: [-5, -5] });
    assert.match(aviso, /^sem o vínculo de lote \(recorrencia_id\): sem resposta$/);
    assert.equal(chamadas.inserts.length, 1);
    assert.equal(Estado.lancamentos.length, 2);
    assert.match(formulario, /\(aviso \? ` · \$\{aviso\}` : ''\)/);
});

test('simulação espelha o mesmo critério (parcelas > 1), usando o contador de simulação como id de lote', () => {
    const inicio = formulario.indexOf('function simulaLancamentoParcelado(');
    assert.ok(inicio >= 0, 'não achou simulaLancamentoParcelado');
    const trecho = formulario.slice(inicio, formulario.indexOf('\n}', inicio) + 2);
    assert.match(trecho, /recorrencia_id: parcelas > 1 \? grupoSimulado : null,/);
});

test('coluna é a da migration 15, não uma nova', () => {
    assert.match(migration15, /ADD COLUMN recorrencia_id integer;/);
    assert.match(regras, /fin\.recorrencia_id.*migration 15|migration 15.*fin\.recorrencia_id/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /todas as parcelas do lote gravam o mesmo `recorrencia_id`/);
    assert.match(regras, /nunca grava `recorrencia_id`, mesmo com Frequência marcada/);
});
