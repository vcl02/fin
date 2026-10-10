// Recorte comum das tabelas avaliado sem renderizar ou alterar dados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const fonte = fs.readFileSync('js/tables.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
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
    const inicio = fonte.indexOf('function categoriaExcluidaDoFiltro');
    const fim = fonte.indexOf('\n// clique no header', inicio);
    if (inicio < 0 || fim < 0) throw Error('Não encontrou o filtro textual da tabela.');
    const contexto = {
        Estado: { filtroTexto: {} },
        estadoFiltroTexto: id => contexto.Estado.filtroTexto[id] || (contexto.Estado.filtroTexto[id] = {}),
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
        valorMascaraParaNumero: () => 0,
        TOLERANCIA_BUSCA_VALOR: 0.05,
        ehVazioTextual: v => {
            if (v == null) return true;
            const limpo = String(v).trim().toLowerCase().replace(/^<|>$/g, '');
            return ['', 'null', 'undefined', 'nan', 'none', 'n/a'].includes(limpo);
        },
    };
    vm.createContext(contexto);
    vm.runInContext(`${fonte.slice(inicio, fim)}\nglobalThis.regras = { passaFiltroTexto, categoriaExcluidaDoFiltro, baseParaSaldoDiario };`, contexto);
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

test('"|" funciona como OU em qualquer coluna de texto, sem diferenciar caixa ou acento', () => {
    const c = filtroDeTexto();
    const linhasComNome = [
        { id: 10, nome: 'Assinatura Netflix', categ: 'Lazer' },
        { id: 11, nome: 'Presente Isabella', categ: 'Presente' },
        { id: 12, nome: 'Mercado', categ: 'Casa' },
    ];
    c.Estado.filtroTexto.debito = { nome: 'assinatura|ISABELLA' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [10, 11],
    );
});

test('"|" isolado ou com pedaço vazio não filtra por esse pedaço, igual ao "!" isolado de Categoria', () => {
    const c = filtroDeTexto();
    const linhasComNome = [
        { id: 20, nome: 'Assinatura Netflix', categ: 'Lazer' },
        { id: 21, nome: 'Mercado', categ: 'Casa' },
    ];
    c.Estado.filtroTexto.debito = { nome: '|' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [20, 21],
    );
    c.Estado.filtroTexto.debito = { nome: 'assinatura|' };
    assert.deepEqual(
        linhasComNome.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [20],
    );
});

test('campo de busca por coluna avisa sobre o atalho "vazio"; Valor avisa sobre + e - no lugar', () => {
    assert.match(fonte, /title="Digite \\'vazio\\' pra achar as linhas sem nada preenchido aqui"/);
    assert.match(fonte, /inputmode=numeric title="Digite \+ pra só positivos, - pra só negativos"/);
});

test('"vazio" em qualquer coluna de texto acha só as linhas sem nada preenchido ali (null, string vazia ou "null"/"n/a" gravado por engano)', () => {
    const c = filtroDeTexto();
    const linhasComObs = [
        { id: 30, obs: null },
        { id: 31, obs: '' },
        { id: 32, obs: 'null' },
        { id: 33, obs: 'Pago via Pix' },
    ];
    c.Estado.filtroTexto.debito = { obs: 'vazio' };
    assert.deepEqual(
        linhasComObs.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [30, 31, 32],
    );
    // sem diferenciar caixa/acento, e isolado — não combina com "!" nem "|"
    c.Estado.filtroTexto.debito = { categ: 'Vazío' };
    assert.deepEqual(
        linhas.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [],
    );
});

test('atalho "vazio" documentado em REGRAS.md', () => {
    assert.match(regras, /digitar exatamente `vazio` \(sem diferenciar caixa ou acento, sozinho no campo — não combina com `!` nem `\|`\)/);
    assert.match(regras, /mesmo critério da célula "—" \(`ehVazioTextual`\)/);
});

test('"+" ou "-" sozinho em Valor filtra só pelo sinal, ignorando a magnitude; zero não entra em nenhum dos dois', () => {
    const c = filtroDeTexto();
    const linhasComValor = [
        { id: 40, v: 100 },
        { id: 41, v: -30 },
        { id: 42, v: 0 },
        { id: 43, v: 5000 },
    ];
    c.Estado.filtroTexto.debito = { valor: '+' };
    assert.deepEqual(
        linhasComValor.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [40, 43],
    );
    c.Estado.filtroTexto.debito = { valor: '-' };
    assert.deepEqual(
        linhasComValor.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [41],
    );
});

test('"+"/"-" em Valor também olha r._sug (linha de Investimento sugerido), não só r.v', () => {
    const c = filtroDeTexto();
    const linhasComSugestao = [
        { id: 50, v: -999, _sug: 300 },     // aporte sugerido: visual é _sug, não v
        { id: 51, v: 999, _sug: -150 },     // resgate necessário
    ];
    c.Estado.filtroTexto.debito = { valor: '+' };
    assert.deepEqual(
        linhasComSugestao.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [50],
    );
    c.Estado.filtroTexto.debito = { valor: '-' };
    assert.deepEqual(
        linhasComSugestao.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [51],
    );
});

test('filtro numérico normal de Valor continua intacto, sem olhar o sinal', () => {
    const c = filtroDeTexto();
    c.Estado.filtroTexto.debito = { valor: '150' };   // valorMascaraParaNumero mockado devolve 0
    const linhasComValor = [{ id: 60, v: 0 }, { id: 61, v: 5 }];
    assert.deepEqual(
        linhasComValor.filter(linha => c.regras.passaFiltroTexto(linha, 'debito')).map(linha => linha.id),
        [60],
    );
});

test('atalho "+"/"-" de Valor documentado em REGRAS.md', () => {
    assert.match(regras, /Digitar exatamente `\+` ou `-` sozinho no campo \(sem nenhum dígito\) é um atalho isolado/);
    assert.match(regras, /`\+` mostra somente positivos, `-` somente negativos. Zero não entra em nenhum dos dois/);
});

test('exclusão de Categoria fornece ao saldo diário a mesma base, sem obedecer outros filtros', () => {
    const c = filtroDeTexto();
    c.Estado.lancamentos = linhas;
    c.Estado.filtroTexto.db = { categ: '!isabella', nome: 'casa' };
    assert.deepEqual(
        Array.from(c.regras.baseParaSaldoDiario('db')).map(linha => linha.id),
        [1, 4],
    );
    c.Estado.filtroTexto.db = { categ: 'Casa' };
    assert.equal(c.regras.baseParaSaldoDiario('db'), null);
});
