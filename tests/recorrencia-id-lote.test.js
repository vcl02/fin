// Vezes > 1 (compra parcelada no Crédito, ou várias ocorrências futuras de um Débito
// recorrente) grava o lote inteiro num único INSERT e depois o mesmo fin.recorrencia_id
// (o próximo número da sequência do banco, nunca o id de uma parcela) em todas, num PATCH em
// lote. Roda a
// salvaLancamentoParceladoNoBanco real com a API simulada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migration15 = fs.readFileSync('migrations/15-recorrencia.sql', 'utf8');

function carregaSalvarLote({ falhaPatch, falhaNumero } = {}) {
    const inicio = formulario.indexOf('async function salvaLancamentoParceladoNoBanco(');
    assert.ok(inicio >= 0, 'não achou salvaLancamentoParceladoNoBanco');
    const fim = formulario.indexOf('\n}\n', inicio) + 3;
    const chamadas = { inserts: [], patches: [], numeros: 0 };
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
        proximaRecorrencia: async () => {
            chamadas.numeros++;
            if (falhaNumero) throw Error('numerar recorrência: 404');
            return 154;   // sequência do banco: nada a ver com os ids 50.. das parcelas
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

test('lote real: um único INSERT com todas as parcelas e um PATCH em lote com o número da sequência', async () => {
    const { salvar, chamadas, Estado } = carregaSalvarLote();
    const aviso = await salvar({ ...base, parcelas: 3, valores: [-10, -10, -10] });
    assert.equal(aviso, '');
    assert.equal(chamadas.inserts.length, 1);
    assert.equal(chamadas.inserts[0].length, 3);
    assert.ok(chamadas.inserts[0].every(p => p.recorrencia_id === null));
    assert.deepEqual(Array.from(chamadas.patches[0].ids), [50, 51, 52]);
    assert.equal(chamadas.numeros, 1);
    assert.equal(chamadas.patches[0].campos.recorrencia_id, 154);
    assert.deepEqual(Estado.lancamentos.map(l => [l.id, l.recorrencia_id]), [[50, 154], [51, 154], [52, 154]]);
    assert.doesNotMatch(formulario, /recorrenciaId = criadas\[0\]\.id/);
});

test('lançamento único (Vezes = 1) nunca grava recorrencia_id, mesmo com Frequência marcada', async () => {
    const { salvar, chamadas } = carregaSalvarLote();
    await salvar({ ...base, parcelas: 1, valores: [-10] });
    assert.equal(chamadas.inserts[0][0].recorrencia_id, null);
    assert.equal(chamadas.patches.length, 0);
    assert.equal(chamadas.numeros, 0);   // nem consome número da sequência
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

test('sem número da sequência (ex.: migration 28 não aplicada) as linhas ficam salvas, sem lote e com aviso', async () => {
    const { salvar, chamadas, Estado } = carregaSalvarLote({ falhaNumero: true });
    const aviso = await salvar({ ...base, parcelas: 2, valores: [-5, -5] });
    assert.match(aviso, /^sem o vínculo de lote \(recorrencia_id\): numerar recorrência: 404$/);
    assert.equal(chamadas.patches.length, 0);
    assert.deepEqual(Estado.lancamentos.map(l => l.recorrencia_id), [null, null]);
});

test('proximaRecorrencia chama a função da migration 28, uma vez só, e valida a resposta', () => {
    const api = fs.readFileSync('js/supabase-api.js', 'utf8');
    const corpo = api.slice(api.indexOf('const proximaRecorrencia'), api.indexOf('const atualizarLancamento ='));
    assert.match(corpo, /\/rest\/v1\/rpc\/proxima_recorrencia/);
    assert.doesNotMatch(corpo, /comRetentativas/);   // não idempotente: cada chamada consome um número
    assert.match(corpo, /if \(!Number\.isInteger\(numero\) \|\| numero <= 0\)/);
    assert.match(regras, /O `recorrencia_id` é \*\*sempre sequencial\*\*/);
});

test('migrations 28 e 29: sequência alinhada, número só do dono, séries marcadas sem tocar o que já tem lote', () => {
    const m28 = fs.readFileSync('migrations/28-recorrencia-sequencial.sql', 'utf8');
    const m29 = fs.readFileSync('migrations/29-marcar-series-sem-recorrencia.sql', 'utf8');
    assert.match(m28, /select setval\('public\.fin_recorrencia_seq', greatest\(/);
    assert.match(m28, /return nextval\('public\.fin_recorrencia_seq'\)::integer;/);
    assert.match(m28, /security definer\s*\n\s*set search_path = ''/);
    assert.match(m28, /is distinct from '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid then\s*\n\s*raise exception/);
    assert.match(m28, /revoke all on function public\.proxima_recorrencia\(\) from public, anon;/);
    assert.match(m29, /if to_regprocedure\('public\.proxima_recorrencia\(\)'\) is null then/);
    assert.match(m29, /where f\.freq is null and f\.recorrencia_id is null and f\.data is not null/);
    assert.match(m29, /where \(cred is not true or valores = 1\)/);
    assert.match(m29, /!~\* '\(investimento\|antecipa\|pagamento fatura\|ajuste\)'/);
    assert.match(m29, /for s in select n, c, cred from series_marcadas order by primeira, n, c, cred loop/);
    assert.match(regras, /`migrations\/29-marcar-series-sem-recorrencia\.sql` dá `freq` e um `recorrencia_id` novo/);
});
