// Regressão: dois cartões de crédito sem coluna nova no banco — o dia do vencimento da
// fatura decide o cartão (dia 13 = Mercado Pago; qualquer outro = Nubank, todo o histórico).
// Roda as regras reais de js/domain.js, js/shared.js e js/finance.js no mesmo contexto.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const ler = arquivo => fs.readFileSync(arquivo, 'utf8');
const visoes = ler('js/cycle-views.js');
const formulario = ler('js/form.js');
const interacoes = ler('js/interactions.js');
const tabelas = ler('js/tables.js');
const graficos = ler('js/charts.js');
const regras = ler('docs/REGRAS.md');
const decisoes = ler('docs/DECISOES.md');

function carregaRegras(estado = { ciclos: [], faturas: [] }) {
    const contexto = {
        Estado: estado,
        MESES: [],
        document: { getElementById: () => ({}) },
        setTimeout, clearTimeout,
        nomeFatura: f => f.vencimento.split('-').reverse().join('/'),
    };
    vm.createContext(contexto);
    ['js/domain.js', 'js/shared.js', 'js/finance.js'].forEach(arquivo => vm.runInContext(ler(arquivo), contexto));
    vm.runInContext(`globalThis.r = { cartaoDaFatura, alocacaoAntecipacoes, abatimentoDoCartao, faturasLiquidasDoCiclo,
        tituloFaturaDoCiclo, vencimentoDoCiclo, limiteCartaoOcupado, limiteCartaoTotal, limiteCartaoLivre,
        definirLimiteCartao, limiteCartaoContratado };`, contexto);
    return contexto.r;
}

// Um ciclo de novembro com fatura Nubank (12/11) e Mercado Pago (13/11).
const estadoDoisCartoes = () => ({
    ciclos: [{ ini: '2026-11-01', fat: '2026-11-30' }],
    faturas: [{ vencimento: '2026-11-12' }, { vencimento: '2026-11-13' }],
});

test('o dia do vencimento decide o cartão; sem fatura é Nubank', () => {
    const r = carregaRegras();
    assert.equal(r.cartaoDaFatura('2026-11-13'), 'mp');
    assert.equal(r.cartaoDaFatura('2026-11-13T00:00:00'), 'mp');
    assert.equal(r.cartaoDaFatura('2026-11-12'), 'nubank');
    assert.equal(r.cartaoDaFatura('2026-11-20'), 'nubank');
    assert.equal(r.cartaoDaFatura(null), 'nubank');
});

test('antecipação abate só a fatura do próprio cartão; o total por ciclo continua a soma', () => {
    const r = carregaRegras(estadoDoisCartoes());
    const abatido = r.alocacaoAntecipacoes([
        { cred: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' },
        { cred: true, periodoIdx: 0, v: -100, fatura: '2026-11-13' },
        // Antecipação do Mercado Pago maior que a fatura dele: não transborda pro Nubank.
        { cred: false, categ: 'Antecipação Fatura', data: '2026-11-05', v: -150, fatura: '2026-11-13' },
        // Sem fatura: fallback cronológico, só no Nubank.
        { cred: false, categ: 'Antecipação Fatura', data: '2026-11-06', v: -50 },
    ]);
    assert.deepEqual({ ...abatido }, { 0: 150 });
    assert.deepEqual({ ...r.abatimentoDoCartao(abatido, 'mp') }, { 0: 100 });
    assert.deepEqual({ ...r.abatimentoDoCartao(abatido, 'nubank') }, { 0: 50 });
    // Mapa montado à mão (sem detalhe por cartão) continua inteiro do Nubank.
    assert.deepEqual({ ...r.abatimentoDoCartao({ 0: 10 }, 'nubank') }, { 0: 10 });
    assert.deepEqual({ ...r.abatimentoDoCartao({ 0: 10 }, 'mp') }, {});
});

test('uma fatura líquida por cartão, cada uma no seu vencimento', () => {
    const r = carregaRegras(estadoDoisCartoes());
    const base = [
        { cred: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' },
        { cred: true, periodoIdx: 0, v: -100, fatura: '2026-11-13' },
        { cred: false, categ: 'Antecipação Fatura', data: '2026-11-05', v: -40, fatura: '2026-11-13' },
    ];
    // JSON: arrays criados no contexto do vm não passam no deepEqual entre realms.
    const faturas = JSON.parse(JSON.stringify(r.faturasLiquidasDoCiclo(base, r.alocacaoAntecipacoes(base), 0)
        .map(f => [f.cartao, f.liquido, f.vencimento])));
    assert.deepEqual(faturas, [['nubank', -300, '2026-11-12'], ['mp', -60, '2026-11-13']]);
    assert.equal(r.tituloFaturaDoCiclo(0), '12/11/2026 · 13/11/2026');
    assert.equal(r.vencimentoDoCiclo(0, 'mp'), '2026-11-13');
});

test('só Nubank no ciclo: uma fatura, título igual ao de antes', () => {
    const r = carregaRegras({ ciclos: [{ ini: '2026-11-01', fat: '2026-11-30' }], faturas: [{ vencimento: '2026-11-12' }] });
    const base = [{ cred: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' }];
    assert.equal(r.faturasLiquidasDoCiclo(base, r.alocacaoAntecipacoes(base), 0).length, 1);
    assert.equal(r.tituloFaturaDoCiclo(0), '12/11/2026');
});

test('cada cartão ocupa o próprio limite; Mercado Pago sem garantia', () => {
    const r = carregaRegras(estadoDoisCartoes());
    const linhas = [
        { cred: true, pago: true, periodoIdx: 0, v: -300, fatura: '2026-11-12' },
        { cred: true, pago: true, periodoIdx: 0, v: -200, fatura: '2026-11-13' },
        { cred: true, pago: false, periodoIdx: 0, v: -999, fatura: '2026-11-13' },   // aberto: projeção
    ];
    assert.equal(r.limiteCartaoOcupado(linhas, {}, -Infinity, 'nubank'), 300);
    assert.equal(r.limiteCartaoOcupado(linhas, {}, -Infinity, 'mp'), 200);
    assert.equal(r.limiteCartaoTotal(600, 'nubank'), 3350 + 600);
    assert.equal(r.limiteCartaoTotal(600, 'mp'), 1100);   // garantia não vale no Mercado Pago
    assert.equal(r.limiteCartaoLivre(linhas, {}, 0, -Infinity, 'mp'), 900);
    assert.equal(r.limiteCartaoLivre(linhas, {}, 0), 3050);   // padrão continua sendo o Nubank
});

test('o limite do Mercado Pago é editável sem mexer no do Nubank', () => {
    const r = carregaRegras();
    assert.equal(r.limiteCartaoContratado('mp'), 1100);
    assert.equal(r.definirLimiteCartao('1500,5'.replace(',', '.'), 'mp'), true);
    assert.equal(r.limiteCartaoContratado('mp'), 1500.5);
    assert.equal(r.limiteCartaoContratado(), 3350);
    assert.equal(r.definirLimiteCartao(-1, 'mp'), false);
});

test('preferência local separada por cartão; a do Nubank mantém a chave antiga', () => {
    assert.match(interacoes, /const CHAVE_LIMITE_CARTAO_LOCAL = 'fin\.limite-cartao';/);
    assert.match(interacoes, /const chaveLimiteCartaoLocal = cartao => cartao === CARTAO_NUBANK\s*\n\s*\? CHAVE_LIMITE_CARTAO_LOCAL : `\$\{CHAVE_LIMITE_CARTAO_LOCAL\}\.\$\{cartao\}`;/);
    assert.match(interacoes, /const cartao = input\.dataset\.limiteCartao \|\| CARTAO_NUBANK;/);
    assert.match(visoes, /data-limite-cartao="\$\{l\.cartao\}"/);
});

test('Mercado Pago só entra no título depois da 1ª compra nele; com dois, cada faixa tem nome', () => {
    assert.match(visoes, /const cartoesNoTitulo = CARTOES\.filter\(cartao => cartao === CARTAO_NUBANK \|\|\s*\n\s*Estado\.lancamentos\.some\(r => r\.cred && cartaoDaFatura\(r\.fatura\) === cartao\)\);/);
    assert.match(visoes, /const nomeNoTitulo = cartao => cartoesNoTitulo\.length > 1/);
});

test('Débito, saldo diário e gráfico usam uma linha de fatura por cartão', () => {
    assert.match(visoes, /const linhasFatura = faturasLiquidasDoCiclo\(visiveis, abatido, i\)/);
    assert.match(visoes, /const sid = f\.cartao === CARTAO_NUBANK \? `fat:\$\{i\}` : `fat:\$\{i\}:\$\{f\.cartao\}`;/);
    assert.match(visoes, /nome: `Fatura \$\{NOME_CARTAO\[f\.cartao\]\}`/);
    assert.match(ler('js/finance.js'), /faturasLiquidasDoCiclo\(base, abat, idx\)\.forEach/);
    assert.match(graficos, /faturasLiquidasDoCiclo\(base, abat, i\)\.forEach/);
    assert.doesNotMatch(visoes + graficos, /'Fatura do cartão'/);
});

test('tabela única marca só o que é do Mercado Pago', () => {
    assert.match(tabelas, /const badgeCartao = r\.cred && ehMercadoPago/);
    assert.match(tabelas, /\$\{ehMercadoPago \? ' MP' : ''\}<\/span>/);
});

function carregaVencimentosPrevistos() {
    const inicio = formulario.indexOf('function vencimentosPrevistosDosCartoes(');
    const fim = formulario.indexOf('\n}\n', inicio) + 3;
    const contexto = {
        CARTOES: ['nubank', 'mp'], DIA_VENCIMENTO_CARTAO: { nubank: 12, mp: 13 },
        DATA_LIMITE_RECORRENCIA: '2029-12-31', hojeISO: () => '2026-10-16',
    };
    vm.createContext(contexto);
    vm.runInContext(`${formulario.slice(inicio, fim)}\nglobalThis.f = vencimentosPrevistosDosCartoes;`, contexto);
    return contexto.f;
}

test('cadastro oferece os vencimentos dos dois cartões, do mês passado até dez/2029', () => {
    const vencimentos = Array.from(carregaVencimentosPrevistos()('2026-10-16'));
    assert.deepEqual(vencimentos.slice(0, 4), ['2026-09-12', '2026-09-13', '2026-10-12', '2026-10-13']);
    assert.deepEqual(vencimentos.slice(-2), ['2029-12-12', '2029-12-13']);
    // Virada de ano no mês anterior.
    assert.deepEqual(Array.from(carregaVencimentosPrevistos()('2027-01-05')).slice(0, 2), ['2026-12-12', '2026-12-13']);
    assert.match(formulario, /const faturasSet = new Set\(vencimentosPrevistosDosCartoes\(\)\);/);
    assert.match(formulario, /`\$\{nomeFatura\(\{ vencimento \}\)\} · \$\{NOME_CARTAO\[cartaoDaFatura\(vencimento\)\]\}`/);
});

test('sugestão de fatura fica no cartão da 1ª parcela escolhida (Nubank por padrão)', () => {
    assert.match(formulario, /const cartaoDaSugestao = idsSelecionados\[0\] \? cartaoDaFatura\(idsSelecionados\[0\]\) : CARTAO_NUBANK;/);
    assert.match(formulario, /faturas\.filter\(f => cartaoDaFatura\(f\.vencimento\) === cartaoDaSugestao\)/);
    assert.match(formulario, /if \(parcela === 0\) atualizarFaturasDoFormulario\(idsFaturasDoFormulario\(false\)\);/);
});

test('regra e decisão documentadas', () => {
    assert.match(regras, /Dois cartões de crédito, sem coluna nova: o dia do vencimento da `fatura` decide o cartão/);
    assert.match(regras, /O Mercado Pago tem limite contratado próprio \(`LIMITE_CARTAO_MP`, inicialmente \*\*R\$ 1\.100,00\*\*\), editável no título igual ao do Nubank, e nunca tem garantia/);
    assert.match(decisoes, /## Fatura e Crédito/);
    assert.match(decisoes, /Regra provisória: o cartão sai do dia do vencimento da fatura/);
    assert.doesNotMatch(regras, /O único cartão atual é o Nubank/);
});
