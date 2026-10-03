// Contrato visual-financeiro: a tabela Crédito é prévia; o saldo continua no ciclo próprio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('js/finance.js', 'utf8');
const dominio = fs.readFileSync('js/domain.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');
const inicio = script.indexOf('function creditosExibidosNoCiclo(');
const fim = script.length;

if (inicio < 0 || fim < 0) throw Error('Não encontrou a regra de layout do Crédito no módulo financeiro.');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(script.slice(inicio, fim), contexto);
const exibir = (linhas, ciclo) => Array.from(contexto.creditosExibidosNoCiclo(linhas, ciclo));

test('mostra no ciclo atual somente os créditos que pertencem ao ciclo seguinte', () => {
    const linhas = [
        { id: 1, cred: true, periodoIdx: 4 },
        { id: 2, cred: true, periodoIdx: 5 },
        { id: 3, cred: false, periodoIdx: 5 },
    ];
    assert.deepEqual(exibir(linhas, 4).map(r => r.id), [2]);
});

test('não desloca créditos quando não existe uma competência seguinte', () => {
    assert.deepEqual(exibir([{ id: 1, cred: true, periodoIdx: 4 }], 4), []);
});

test('o título do Crédito mostra o saldo após antecipações da mesma fatura', () => {
    assert.equal(
        contexto.totalCreditoExibidoAposAntecipacoes([{ v: -2922.26 }], 500),
        -2422.26
    );
});

test('o único título de Crédito exibe limite livre com a garantia do Débito, sem outra tabela', () => {
    assert.match(dominio, /let LIMITE_CARTAO = 3350;/);
    assert.match(visoes, /const guardadoGarantido = guardadoGarantidoAte\(Estado\.lancamentos, i\)/);
    assert.match(visoes, /const limiteTotal = limiteCartaoTotal\(guardadoGarantido\)/);
    assert.match(visoes, /const limiteLivreHoje = limiteCartaoLivre\(Estado\.lancamentos, abatidoDoCartao, guardadoGarantido\)/);
    assert.match(visoes, /const limiteLivreFuturo = limiteCartaoLivreFuturo\(/);
    assert.match(visoes, /guardadoGarantido, idxCreditoExibido, totalCreditoExibido/);
    assert.match(visoes, /data-limite-cartao/);
    assert.doesNotMatch(visoes, /data-garantia-cartao/);
    assert.match(visoes, /placeholder="0,00"/);
    assert.match(visoes, /limiteGarantido/);
    assert.match(visoes, /const resumoLimiteCartao/);
    assert.match(visoes, /const creditoAcimaLimite = Math\.abs\(totalCreditoHoje\) > limiteTotal \|\| limiteLivreFuturo < -TOLERANCIA_FINANCEIRA/);
    assert.match(visoes, /const alertaTituloCredito = alertaTitulo\('alertaLimite', creditoAcimaLimite,/);
    assert.match(visoes, /Math\.abs\(totalCreditoHoje\) > limiteTotal/);
    assert.match(visoes, /limiteLivreFuturo < -TOLERANCIA_FINANCEIRA/);
    assert.match(visoes, /'Gasto acima do limite'/);
    assert.match(visoes, /`Crédito\$\{alertaTituloCredito\}`/);
    assert.match(visoes, /de \$\{brl\(limiteTotal\)\} \(/);
    assert.match(visoes, /value="\$\{limiteContratadoEditavel\}"/);
    assert.match(visoes, /> Aprovado<\/span>/);
    assert.match(visoes, /\+ \$\{brl\(garantia\)\} Garantido/);
    assert.match(estilos, /\.limiteCartao/);
    assert.match(estilos, /\.limiteCartaoEditavel/);
    assert.match(estilos, /\.limiteCartaoEditavel::placeholder/);
    assert.match(interacoes, /formataMascaraDinheiro\(input\.value\)/);
    assert.match(interacoes, /input\.select\(\)/);
    assert.match(interacoes, /const aprovado = numeroDoLimiteDigitado\(input\.value\);/);
    assert.match(interacoes, /definirLimiteCartao\(aprovado\)/);
    assert.doesNotMatch(estilos, /\.limiteTotal/);
    assert.match(estilos, /\.alertaTitulo/);
    assert.match(estilos, /\.alertaTitulo\.vazio/);
    assert.match(estilos, /flex: 0 0 5\.7rem/);
});

test('títulos distinguem o retrato pago até hoje da previsão futura', () => {
    assert.match(visoes, /const debitoHoje = resumoDebitoPagoAte\(Estado\.lancamentos\)/);
    assert.match(visoes, /const pagosAteHoje = lancamentosPagosAte\(Estado\.lancamentos\)/);
    assert.match(visoes, /const cicloDebitoFuturo = dataISO\(periodo\.ini\) > hojeISO\(\)/);
    assert.match(visoes, /const linhaHojeDebito = cicloDebitoFuturo \? ''/);
    assert.match(visoes, /const linhaHojeCredito = cicloDebitoFuturo \? ''/);
    assert.match(visoes, /const alertaTitulo = \(classe, visivel, titulo, rotulo\) =>/);
    assert.match(visoes, /'Saldo negativo após usar o guardado'/);
    assert.match(visoes, /const debitoTemSaldoVermelho = classeSaldoHoje == 'vm' \|\| classeSaldoFuturo == 'vm'/);
    assert.match(visoes, /const alertaTituloDebito = alertaTitulo\('alertaSaldo', debitoTemSaldoVermelho,/);
    assert.match(visoes, /`Débito\$\{alertaTituloDebito\}`/);
    assert.doesNotMatch(visoes, /Pago \+ aberto/);
    assert.match(visoes, /Guardado/);
    assert.match(estilos, /\.resumoTitulo/);
    assert.match(estilos, /\.resumoLinha/);
    assert.match(estilos, /\.alertaTitulo/);
    assert.match(visoes, /class=resumoDados/);
    assert.match(estilos, /grid-template-columns: 3\.65rem minmax\(0, 1fr\)/);
    assert.match(estilosMobile, /flex-basis: calc\(100% - 1\.95rem\)/);
});

test('prévia de crédito do ciclo atual mantém Hoje mesmo quando a fatura vence depois', () => {
    assert.match(visoes, /A prévia de Crédito do ciclo atual continua tendo/);
    assert.doesNotMatch(visoes, /cicloCreditoFuturo/);
    const inicioHoje = visoes.indexOf('const linhaHojeCredito');
    const fimHoje = visoes.indexOf('const resumoCredito');
    assert.doesNotMatch(visoes.slice(inicioHoje, fimHoje), /Pago <b/);
});

test('documenta Nubank como cartão único e exige separação explícita antes de outro cartão', () => {
    assert.match(regras, /único cartão atual é o Nubank/);
    assert.match(regras, /identificação explícita de cartão/);
    assert.match(decisoes, /identidade explícita de cartão em crédito e antecipação/);
    assert.match(decisoes, /Não se deve usar marca, categoria, nome do lançamento ou vencimento/);
});
