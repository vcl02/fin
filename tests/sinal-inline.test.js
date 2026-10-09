// Regressão: botão +/- inline inverte o sinal de um lançamento real na hora, sem abrir
// o campo de Valor pra digitar — mesmo esquema do toggle Pago (UPDATE imediato).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const compartilhado = fs.readFileSync('js/shared.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const estilosForm = fs.readFileSync('css/forms.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('célula de Valor editável ganha o botão de sinal, reaproveitando o ícone do cadastro', () => {
    assert.match(compartilhado, /const celValorEditavel = r => `<td class="n \$\{corValor\(r\.v\)\}">` \+/);
    assert.match(compartilhado, /class="sinalBt compacto\$\{r\.v < 0 \? '' : ' pos'\}" data-tog-sinal="\$\{escapeHtml\(String\(r\.id\)\)\}"/);
    assert.match(compartilhado, /title="Inverter sinal" aria-label="Inverter sinal"/);
    assert.match(estilosForm, /\.sinalBt\.compacto\s*\{/);
});

test('clique no botão de sinal inverte na hora (UPDATE imediato), igual ao toggle Pago', () => {
    const inicio = interacoes.indexOf("el('out').addEventListener('click', async e => {\n    const botao = e.target.closest('[data-tog-sinal]');");
    assert.ok(inicio >= 0, 'não achou o handler do botão de sinal');
    const trecho = interacoes.slice(inicio, interacoes.indexOf('\n});', inicio) + 4);
    assert.match(trecho, /if \(modoRestrito\(\)\) return;/);
    assert.match(trecho, /const novoValor = -\(r\.v \|\| 0\);/);
    assert.match(trecho, /if \(!Estado\.simulando && !r\._sim\) await atualizarLancamento\(r\.id, \{ valor: novoValor \}\);/);
    assert.match(trecho, /r\.valor = novoValor;\s*\n\s*r\.v = novoValor;/);
    assert.match(trecho, /mostrarToast\('Falhou ao atualizar', err\.message\);/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /botão \+\/− ao lado do Valor \(mesmo ícone do cadastro\) que inverte o sinal na hora/);
    assert.match(regras, /Indisponível para a conta restrita e para linhas sintéticas\/simuladas sem `id` real\./);
});
