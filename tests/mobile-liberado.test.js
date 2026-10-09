// Contrato de paridade mobile/desktop: a única restrição de interface é por conta (Isabella),
// nunca por largura de tela. Cobre o botão hambúrguer e a liberação do mobile.css.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const estilosBase = fs.readFileSync('css/base.css', 'utf8');
const estilosMobile = fs.readFileSync('css/mobile.css', 'utf8');
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

test('botão hambúrguer existe, aponta pra #tool e começa fechado', () => {
    assert.match(pagina, /<button id=btMenuMobile title="Menu" aria-label="Abrir menu" aria-expanded=false aria-controls=tool>/);
    assert.match(pagina, /<div class=tool id=tool>/);
});

test('hambúrguer fica escondido no desktop e só aparece dentro do @media mobile', () => {
    assert.match(estilosBase, /#btMenuMobile\s*\{[\s\S]*?display:\s*none;/);
    const inicioMedia = estilosMobile.indexOf('@media (max-width: 640px)');
    const fimMedia = estilosMobile.indexOf('\n  }', estilosMobile.indexOf('.tool.aberto'));
    const blocoMedia = estilosMobile.slice(inicioMedia, fimMedia);
    assert.match(blocoMedia, /#btMenuMobile\s*\{\s*display:\s*flex;/);
    assert.match(blocoMedia, /\.tool\s*\{\s*display:\s*none;/);
    assert.match(blocoMedia, /\.tool\.aberto\s*\{\s*display:\s*block;/);
});

test('clique no hambúrguer alterna a classe aberto e aria-expanded', () => {
    assert.match(bootstrap, /el\('btMenuMobile'\)\.onclick = \(\) => \{\s*\n\s*const aberto = el\('tool'\)\.classList\.toggle\('aberto'\);\s*\n\s*el\('btMenuMobile'\)\.setAttribute\('aria-expanded', String\(aberto\)\);\s*\n\s*\};/);
});

test('mobile.css não esconde mais nada por largura de tela, só o que genuinamente não cabe', () => {
    // As restrições antigas (navegação De/Até, Atual, simulação, Duplicar/Excluir na barra)
    // saíram inteiramente: a paridade com o desktop é total, só a .tool vira gaveta.
    assert.doesNotMatch(estilosMobile, /#fde,|#navCompararAte,|#fate,|#cicloHoje,/);
    assert.doesNotMatch(estilosMobile, /#selbar #seldup|#selbar #seldel/);
    assert.doesNotMatch(estilosMobile, /display:\s*none\s*!important/);
    assert.match(estilosMobile, /\.head\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /## Conta restrita \(Isabella\)/);
    assert.match(regras, /identificada pelo e-mail da sessão/);
    assert.match(regras, /não uma política de banco: a segurança de dados de fato continua sendo responsabilidade do RLS/);
});
