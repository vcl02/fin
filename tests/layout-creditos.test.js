// Contrato visual-financeiro: a tabela Crédito é prévia; o saldo continua no ciclo próprio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync('js/finance.js', 'utf8');
const dominio = fs.readFileSync('js/domain.js', 'utf8');
const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
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
    assert.match(dominio, /let LIMITE_CARTAO = 3750;/);
    assert.match(visoes, /const guardadoGarantido = guardadoGarantidoAte\(Estado\.lancamentos, i\)/);
    assert.match(visoes, /const limiteLivre = limiteCartaoLivre\(Estado\.lancamentos, abatidoDoCartao, guardadoGarantido\)/);
    assert.match(visoes, /data-limite-cartao/);
    assert.match(visoes, /limiteGarantido/);
    assert.match(estilos, /\.limiteCartao/);
    assert.match(estilos, /\.limiteCartaoEditavel/);
});

test('documenta Nubank como cartão único e exige separação explícita antes de outro cartão', () => {
    assert.match(regras, /único cartão atual é o Nubank/);
    assert.match(regras, /identificação explícita de cartão/);
    assert.match(decisoes, /identidade explícita de cartão em crédito e antecipação/);
    assert.match(decisoes, /Não se deve usar marca, categoria, nome do lançamento ou vencimento/);
});
