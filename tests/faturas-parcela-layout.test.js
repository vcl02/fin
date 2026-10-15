// Regressão: compra em muitas parcelas gera um <select> de fatura por parcela
// (atualizarFaturasDoFormulario, js/form.js) dentro do campo Fatura do cadastro — sem
// limite de altura, essa lista empurrava o resto do formulário (Vezes, Frequência,
// Categorias, Salvar) pra muito longe no mobile, obrigando a rolar demais pra voltar a
// enxergar o botão Salvar. #faturasPorParcela ganha sua própria área rolável e compacta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const estilos = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('o campo Fatura do cadastro envolve a lista de parcelas num container próprio, dentro do fluxo normal do formulário', () => {
    assert.match(pagina, /<div class=fm id=fFaturasWrap hidden>\s*\n\s*<span>Fatura<\/span>\s*\n\s*<div id=faturasPorParcela><\/div>\s*\n\s*<\/div>/);
});

test('#faturasPorParcela tem altura máxima própria (9rem, +/- 2 parcelas por vez) e rola por conta, em vez de esticar o formulário inteiro', () => {
    assert.match(estilos, /#faturasPorParcela \{\s*\n\s*display: flex;\s*\n\s*flex-direction: column;\s*\n\s*gap: \.7rem;\s*\n\s*max-height: 9rem;\s*\n\s*overflow-y: auto;/);
});

test('o formulário inteiro (#formNovo) continua com seu próprio scroll e teto de altura, independente do limite da lista de parcelas', () => {
    assert.match(estilos, /#formNovo \{[\s\S]*?overflow-y: auto;[\s\S]*?max-height: 88vh;/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /Sem Frequência, o cadastro gera um `<select>` de fatura por parcela dentro do campo \*\*Fatura\*\* \(com Frequência, só o da 1ª — ver regra acima\); essa lista tem altura própria limitada \(9rem, \+\/- 2 parcelas visíveis por vez\) e rola por conta, em vez de esticar o formulário inteiro/);
    assert.match(regras, /com Vezes alto \(compra em muitas prestações\), sem esse limite o resto do formulário \(Vezes, Frequência, Categorias, Salvar\) ficaria empurrado pra muito longe no mobile/);
});
