// Reserva/Comprometido como bits do lançamento (migration 22): checkbox no cadastro,
// coluna clicável na tabela, PATCH imediato — mesmo padrão de Crédito/Pago.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const pagina = fs.readFileSync('index.html', 'utf8');
const estado = fs.readFileSync('js/app-state.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');
const migration = fs.readFileSync('migrations/22-reserva-comprometido-colunas-bool.sql', 'utf8');

test('cadastro tem checkbox de Reserva e Comprometido, desmarcados por padrão (diferente de Crédito/Pago)', () => {
    assert.match(pagina, /<label class="fmChk fmChkIco" title="Reserva">\s*\n\s*<input type=checkbox id=fReserva aria-label="Reserva">/);
    assert.match(pagina, /<label class="fmChk fmChkIco" title="Comprometido">\s*\n\s*<input type=checkbox id=fComprometido aria-label="Comprometido">/);
    // "checked" no HTML (como fCred/fPago/fDivide têm) marcaria por padrão — de propósito
    // ausente aqui, já que reserva/comprometido são marcas raras, não o caso comum.
    assert.doesNotMatch(pagina, /id=fReserva checked|id=fComprometido checked/);
});

test('COLS inclui reserva e comprometido como colunas booleanas, sem recorte em nenhuma tabela', () => {
    assert.match(estado, /\['reserva', 'Reserva', 'b'\], \['comprometido', 'Comprometido', 'b'\],/);
    // colunasAtivas só recorta 'prio' (exclusivo do Backlog); reserva/comprometido
    // aparecem em Débito, Crédito e Backlog igualmente.
    assert.match(estado, /const colunasAtivas = idTabela => idTabela === 'bk'/);
});

test('célula de Reserva/Comprometido mostra "—" quando falso, sem repetir texto negativo em toda linha', () => {
    assert.match(tabelas, /const celFlag = \(r, chave\) => \{/);
    assert.match(tabelas, /const texto = marcado \? ROTULO_FLAG\[chave\] : '—';/);
    assert.match(tabelas, /!r\._sid && !modoRestrito\(\)/);
    assert.match(tabelas, /data-tog-flag="\$\{chave\}:\$\{escapeHtml\(String\(r\.id\)\)\}"/);
    // Pago continua com o esquema antigo (sempre mostra um texto, nunca "—"); só as duas
    // colunas novas usam celFlag.
    assert.match(tabelas, /tipo == 'b' && chave != 'pago' \? `<td>\$\{celFlag\(r, chave\)\}`/);
});

test('clique no badge Reserva/Comprometido faz PATCH imediato, com a mesma guarda de simulação', () => {
    const inicio = interacoes.indexOf("const ROTULO_FLAG_TOGGLE = { reserva: 'Reserva', comprometido: 'Comprometido' };");
    assert.ok(inicio >= 0, 'não achou o handler de togFlag');
    const trecho = interacoes.slice(inicio, interacoes.indexOf('\n});', inicio) + 4);
    assert.match(trecho, /const badge = e\.target\.closest\('\[data-tog-flag\]'\);/);
    assert.match(trecho, /if \(modoRestrito\(\)\) return;/);
    assert.match(trecho, /const \[campo, id\] = badge\.dataset\.togFlag\.split\(':'\);/);
    assert.match(trecho, /const novoValor = !r\[campo\];/);
    assert.match(trecho, /for \(const linha of mesmoNome\) \{/);
    assert.match(trecho, /if \(!Estado\.simulando && !linha\._sim\) await atualizarLancamento\(linha\.id, \{ \[campo\]: novoValor \}\);/);
    assert.match(trecho, /linha\[campo\] = novoValor;/);
    assert.match(trecho, /mostrarToast\('Falhou ao atualizar', err\.message\);/);
});

test('marcar/desmarcar Reserva ou Comprometido propaga pra todos os lançamentos com o mesmo nome', () => {
    const inicio = interacoes.indexOf("const ROTULO_FLAG_TOGGLE = { reserva: 'Reserva', comprometido: 'Comprometido' };");
    const trecho = interacoes.slice(inicio, interacoes.indexOf('\n});', inicio) + 4);
    // mesma comparação de "mesmo nome" usada na detecção de recorrência duplicada: sem
    // acento, sem caixa, ignora linha sintética (_sid nunca tem o badge pra começar, mas a
    // busca por nome não deve puxar uma de qualquer jeito).
    assert.match(trecho, /const nomeChave = semAcento\(r\.nome\)\.trim\(\);/);
    assert.match(trecho, /const mesmoNome = Estado\.lancamentos\.filter\(x => !x\._sid && semAcento\(x\.nome\)\.trim\(\) === nomeChave\);/);
    // toast só quando a varredura de fato pegou mais de um lançamento — clique isolado
    // (nome único) continua silencioso, só o badge já é feedback suficiente.
    assert.match(trecho, /if \(mesmoNome\.length > 1\) \{/);
});

test('Duplicar/Editar herdam reserva/comprometido do lançamento de origem; novo cadastro não força nada', () => {
    assert.match(formulario, /el\('fReserva'\)\.checked = !!prefill\.reserva;/);
    assert.match(formulario, /el\('fComprometido'\)\.checked = !!prefill\.comprometido;/);
});

test('submeteNovoLancamento lê os dois checkboxes e propaga pra simulação e pro Supabase', () => {
    assert.match(formulario, /const reserva = el\('fReserva'\)\.checked;\s*\n\s*const comprometido = el\('fComprometido'\)\.checked;/);
    assert.match(formulario, /simulaLancamentoParcelado\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, parcelas, valores, faturaIds: faturasDaSerie \}\);/);
    assert.match(formulario, /salvaLancamentoParceladoNoBanco\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, parcelas, valores, faturaIds: faturasDaSerie \}\);/);
    assert.match(formulario, /async function salvaLancamentoParceladoNoBanco\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, parcelas, valores, faturaIds = \[\] \}\)/);
    assert.match(formulario, /data: dataParcela, freq, cred, pago, reserva, comprometido,/);
    assert.match(formulario, /function simulaLancamentoParcelado\(\{ nome, categ, freq, data, cred, pago, reserva, comprometido, parcelas, valores, faturaIds = \[\] \}\)/);
    assert.match(formulario, /cred, pago, reserva, comprometido,\s*\n\s*fatura: faturaVenc,/);
});

test('submeteEdicaoLancamento reenvia reserva/comprometido no PATCH, igual aos demais campos', () => {
    assert.match(formulario, /nome, categ: normalizaCategorias\(categ\), freq, data, cred, pago, reserva, comprometido,/);
});

test('migration 22 cria os dois bits e extrai dos tokens exatos em categ, sem deixar o texto', () => {
    assert.match(migration, /add column if not exists reserva boolean not null default false;/);
    assert.match(migration, /add column if not exists comprometido boolean not null default false;/);
    assert.match(migration, /lower\(trim\(token\)\) not in \('reserva', 'comprometido'\)/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /checkbox.*Reserva.*Comprometido|Reserva.*Comprometido.*checkbox/);
});

test('Comprometido marcado em laranja e Reserva em amarelo, inclusive ao alternar e em linha só leitura', () => {
    const vm = require('node:vm');
    const inicio = tabelas.indexOf('const ROTULO_FLAG =');
    const fim = tabelas.indexOf('\n};', inicio) + 3;
    const ctx = { escapeHtml: String, restrito: false };
    ctx.modoRestrito = () => ctx.restrito;
    vm.runInNewContext(`${tabelas.slice(inicio, fim)}\nthis.celFlag = celFlag;`, ctx);
    assert.match(ctx.celFlag({ id: 5, comprometido: true }, 'comprometido'), /^<span class="am togFlag"[^>]*>Comprometido<\/span>$/);
    assert.match(ctx.celFlag({ id: 5, reserva: true }, 'reserva'), /^<span class="amarelo togFlag"[^>]*>Reserva<\/span>$/);
    // Desmarcado: "—" sem cor.
    assert.match(ctx.celFlag({ id: 5, reserva: false }, 'reserva'), /^<span class=" togFlag"[^>]*>—<\/span>$/);
    // Linha calculada e conta restrita: mesma cor, sem toggle.
    assert.equal(ctx.celFlag({ id: -3, _sid: 'fat:1', comprometido: true }, 'comprometido'), '<span class=am>Comprometido</span>');
    ctx.restrito = true;
    assert.equal(ctx.celFlag({ id: 5, reserva: true }, 'reserva'), '<span class=amarelo>Reserva</span>');
    // O clique troca a mesma classe da marca, nunca o verde de Pago.
    assert.match(interacoes, /badge\.classList\.toggle\(COR_FLAG\[campo\], novoValor\);/);
    const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
    assert.match(estilos, /\.amarelo \{\s*\n\s*color: #E8CF4A;/);
    assert.match(regras, /\*\*Comprometido em laranja\*\* e \*\*Reserva em amarelo\*\*/);
});
