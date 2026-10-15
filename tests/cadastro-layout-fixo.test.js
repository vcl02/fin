// Regressão: no cadastro, trocar Frequência não esconde Vezes — ele fica desativado
// mostrando a contagem da série ("39x até 2029") e, ao tirar a Frequência, volta ao valor
// que tinha. Roda a atualizaModoFrequencia real (js/form.js) com um <select> simulado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const formulario = fs.readFileSync('js/form.js', 'utf8');
const decisoes = fs.readFileSync('docs/DECISOES.md', 'utf8');

function selectSimulado(valores) {
    const select = {
        options: [], dataset: {}, disabled: false, _valor: valores[0],
        get value() { return this._valor; },
        set value(v) { if (this.options.some(o => o.value === v)) this._valor = v; },
        add(opcao) { opcao.parent = this; this.options.push(opcao); },
        querySelector(seletor) {
            const valor = seletor.match(/value=(\w+)/)[1];
            return this.options.find(o => o.value === valor) || null;
        },
    };
    valores.forEach(v => select.add(new Opcao(v, v)));
    return select;
}

function Opcao(texto, valor) {
    this.textContent = texto;
    this.value = valor;
    this.remove = () => { this.parent.options = this.parent.options.filter(o => o !== this); };
}

function carregaModoFrequencia({ freq, data, editando }) {
    const inicio = formulario.indexOf('function atualizaModoFrequencia() {');
    const fim = formulario.indexOf('\n}\n', inicio) + 3;
    if (inicio < 0) throw Error('Não encontrou atualizaModoFrequencia.');
    const campos = {
        fParcelas: selectSimulado(['1', '2', '3']),
        fFreq: { value: freq },
        fData: { value: data },
        fParcelasWrap: { hidden: false },
        fDivideWrap: { hidden: false },
    };
    const contexto = {
        el: id => campos[id],
        modalNovo: { dataset: editando ? { editandoId: '7' } : {} },
        Option: Opcao,
        DATA_LIMITE_RECORRENCIA: '2029-12-31',
        ocorrenciasAteLimite: () => 39,
    };
    vm.createContext(contexto);
    vm.runInContext(`${formulario.slice(inicio, fim)}\nglobalThis.atualizaModoFrequencia = atualizaModoFrequencia;`, contexto);
    return { campos, atualizaModoFrequencia: contexto.atualizaModoFrequencia };
}

test('com Frequência, Vezes continua visível, desativado, mostrando a contagem até o limite', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '2026-10-15' });
    campos.fParcelas.value = '3';
    atualizaModoFrequencia();
    assert.equal(campos.fParcelasWrap.hidden, false);
    assert.equal(campos.fDivideWrap.hidden, false);
    assert.equal(campos.fParcelas.disabled, true);
    assert.equal(campos.fParcelas.value, 'serie');
    assert.equal(campos.fParcelas.querySelector('option[value=serie]').textContent, '39x até 2029');
});

test('sem Data, a contagem pede a data em vez de um número', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '' });
    atualizaModoFrequencia();
    assert.equal(campos.fParcelas.querySelector('option[value=serie]').textContent, 'Escolha a data');
});

test('tirar a Frequência devolve o Vezes anterior, editável, e remove a opção da série', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '2026-10-15' });
    campos.fParcelas.value = '3';
    atualizaModoFrequencia();
    atualizaModoFrequencia();   // chamada repetida (ex.: troca de data) não perde o anterior
    campos.fFreq.value = '';
    atualizaModoFrequencia();
    assert.equal(campos.fParcelas.disabled, false);
    assert.equal(campos.fParcelas.value, '3');
    assert.equal(campos.fParcelas.querySelector('option[value=serie]'), null);
});

test('depois de um reset (série já não selecionada), o valor do reset prevalece', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: 'Mensal', data: '2026-10-15' });
    campos.fParcelas.value = '3';
    atualizaModoFrequencia();
    campos.fParcelas.value = '1';   // formNovo.reset() volta à 1ª opção
    campos.fFreq.value = '';
    atualizaModoFrequencia();
    assert.equal(campos.fParcelas.value, '1');
});

test('Editar continua escondendo Vezes e Dividir', () => {
    const { campos, atualizaModoFrequencia } = carregaModoFrequencia({ freq: '', data: '2026-10-15', editando: true });
    atualizaModoFrequencia();
    assert.equal(campos.fParcelasWrap.hidden, true);
    assert.equal(campos.fDivideWrap.hidden, true);
});

test('a contagem acompanha a Data', () => {
    assert.match(formulario, /el\('fData'\)\.addEventListener\('change', \(\) => \{\s*\n\s*atualizaModoFrequencia\(\);/);
});

test('exceção pontual registrada em DECISOES.md, sem mudar a direção minimalista', () => {
    assert.match(decisoes, /## Cadastro com layout fixo\s*\n\s*\nExceção pontual, sem mudar a direção minimalista: no cadastro, trocar Crédito ou Frequência desativa campos em vez de escondê-los/);
    assert.match(decisoes, /Os demais formulários seguem a regra geral de mostrar só o necessário\./);
});
