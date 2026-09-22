// Utilitários financeiros compartilhados: datas, texto e distribuição de antecipações.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/shared.js', 'utf8');

function regrasCompartilhadas(estado = { ciclos: [], faturas: [] }) {
    const contexto = {
        Estado: estado,
        MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
        document: { getElementById: () => ({}) },
        setTimeout, clearTimeout,
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte}\nglobalThis.regras = { dataISO, dataBR, semAcento, escapeHtml, valorValido, ehAntecipacaoFatura, ehTransferenciaFatura, somaMeses, somaDias, dataDaOcorrencia, alocacaoAntecipacoes };`, contexto);
    return contexto.regras;
}

test('normaliza data e texto sem perder a intenção da busca', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.dataISO('2026-09-21T18:30:00.000Z'), '2026-09-21');
    assert.equal(r.dataBR('2026-09-21'), '21/09/2026');
    assert.equal(r.semAcento('  Evolução ÓBRA '), '  evolucao obra ');
    assert.equal(r.escapeHtml('<Mercado & "Casa">'), '&lt;Mercado &amp; &quot;Casa&quot;&gt;');
});

test('rejeita valores textuais que representam ausência de categoria', () => {
    const r = regrasCompartilhadas();
    [null, undefined, '', ' null ', '<undefined>', 'N/A', 'NaN'].forEach(valor => assert.equal(r.valorValido(valor), false));
    ['Investimento', '0'].forEach(valor => assert.equal(r.valorValido(valor), true));
    assert.equal(r.valorValido(0), false, 'zero não é uma categoria preenchida');
});

test('soma meses preservando o dia e limita ao fim do mês de destino', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.somaMeses('2026-01-31', 1), '2026-02-28');
    assert.equal(r.somaMeses('2024-01-31', 1), '2024-02-29');
    assert.equal(r.somaMeses('2024-02-29', 12), '2025-02-28');
    assert.equal(r.somaMeses('2026-08-15', 0), '2026-08-15');
});

test('calcula recorrências mensais, semanais, quinzenais, semestrais e anuais', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.dataDaOcorrencia('2026-01-31', 1, 'Mensal'), '2026-02-28');
    assert.equal(r.dataDaOcorrencia('2026-09-21', 2, 'Semanal'), '2026-10-05');
    assert.equal(r.dataDaOcorrencia('2026-09-21', 2, 'Quinzenal'), '2026-10-19');
    assert.equal(r.dataDaOcorrencia('2026-01-31', 1, 'Semestral'), '2026-07-31');
    assert.equal(r.dataDaOcorrencia('2024-02-29', 1, 'Anual'), '2025-02-28');
});

test('frequência ausente usa mensal para não concentrar parcelas na mesma data', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.dataDaOcorrencia('2026-03-10', 0, ''), '2026-03-10');
    assert.equal(r.dataDaOcorrencia('2026-03-10', 2, 'desconhecida'), '2026-05-10');
    assert.equal(r.somaDias('2026-12-31', 1), '2027-01-01');
});

test('reconhece antecipação sem confundir uma categoria apenas parecida', () => {
    const r = regrasCompartilhadas();
    assert.equal(r.ehAntecipacaoFatura('Antecipação de Fatura'), true);
    assert.equal(r.ehAntecipacaoFatura('ANTECIPACAO FATURA'), true);
    assert.equal(r.ehAntecipacaoFatura('Antecipação de aluguel'), false);
    assert.equal(r.ehTransferenciaFatura({ cred: false, categ: 'Antecipação de Fatura' }), true);
    assert.equal(r.ehTransferenciaFatura({ cred: true, categ: 'Antecipação de Fatura' }), false);
});

test('antecipa faturas com vínculo explícito sem consumir faturas anteriores', () => {
    const estado = {
        ciclos: [
            { ini: '2026-09-01', fat: '2026-09-30' },
            { ini: '2026-10-01', fat: '2026-10-31' },
        ],
        faturas: [{ vencimento: '2026-09-20' }, { vencimento: '2026-10-20' }],
    };
    const r = regrasCompartilhadas(estado);
    const abatido = r.alocacaoAntecipacoes([
        { cred: true, periodoIdx: 0, v: -100 },
        { cred: true, periodoIdx: 1, v: -200 },
        { cred: false, categ: 'Antecipação de Fatura', data: '2026-09-05', v: -80, fatura_venc: '2026-10-20' },
    ]);
    assert.equal(abatido[0] || 0, 0);
    assert.equal(abatido[1], 80);
});

test('antecipa sem vínculo em ordem cronológica e nunca abate além do saldo', () => {
    const estado = {
        ciclos: [
            { ini: '2026-09-01', fat: '2026-09-30' },
            { ini: '2026-10-01', fat: '2026-10-31' },
        ],
        faturas: [{ vencimento: '2026-09-20' }, { vencimento: '2026-10-20' }],
    };
    const r = regrasCompartilhadas(estado);
    const abatido = r.alocacaoAntecipacoes([
        { cred: true, periodoIdx: 0, v: -100 },
        { cred: true, periodoIdx: 1, v: -50 },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-09-05', v: -120 },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-09-10', v: -100 },
    ]);
    assert.deepEqual({ ...abatido }, { 0: 100, 1: 50 });
});
