// Regressão: recorrência (nome+categoria) que cai 2x no mesmo ciclo, em meses-calendário
// diferentes — sintoma de a janela entre dois Faturamento PJ cortar o mês ao meio, não uma
// despesa nova. Em Comparar isso já virava só um aviso ("*"); aqui, na tabela Débito, a
// ocorrência mais recente do grupo ganha um botão de corrigir a data pro 1º dia do próximo
// ciclo, com confirmação antes do PATCH (altera dado real).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const visoes = fs.readFileSync('js/cycle-views.js', 'utf8');
const tabelas = fs.readFileSync('js/tables.js', 'utf8');
const interacoes = fs.readFileSync('js/interactions.js', 'utf8');
const formulario = fs.readFileSync('js/form.js', 'utf8');
const estilos = fs.readFileSync('css/dashboard.css', 'utf8');
const regras = fs.readFileSync('docs/REGRAS.md', 'utf8');

// Extrai chaveDaRecorrencia, gruposComRecorrenciaDuplicadaEntreMeses e
// marcaOcorrenciasDuplicadasNoCiclo do arquivo real (não reescreve a regra à mão).
function carregaMarcacao() {
    const inicio = visoes.indexOf('function chaveDaRecorrencia');
    const fim = visoes.indexOf('function todasRecorrenciasDaMudancaSaoExplicadas');
    if (inicio < 0 || fim < 0) throw Error('Não encontrou a marcação de recorrência duplicada.');
    const contexto = {
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        categoriaDaComparacao: categ => categ ?? '',
        textoOuTraco: v => (v == null || v === '' ? '—' : v),
        ehLinhaReal: r => Number.isInteger(+r.id) && +r.id > 0 && !r._sid && !r._sim,
        dataISO: v => String(v ?? '').slice(0, 10),
        timestamp: v => new Date(String(v)).getTime(),
    };
    vm.createContext(contexto);
    vm.runInContext(`${visoes.slice(inicio, fim)}
globalThis.chaveDaRecorrencia = chaveDaRecorrencia;
globalThis.gruposComRecorrenciaDuplicadaEntreMeses = gruposComRecorrenciaDuplicadaEntreMeses;
globalThis.marcaOcorrenciasDuplicadasNoCiclo = marcaOcorrenciasDuplicadasNoCiclo;`, contexto);
    return contexto;
}

// Extrai corrigeRecorrenciasDuplicadasNoIntervalo do form.js real E a marcação do
// cycle-views.js real, rodando as duas juntas num contexto isolado — a mesma combinação que
// "Consolidar tudo" usa de verdade, só com atualizarLancamento/reclassificaPeriodo/
// limparCachesFinanceiros simulados (gravam numa lista em vez de chamar o Supabase/redesenhar).
function carregaCorrecaoEmLote() {
    const inicioMarcacao = visoes.indexOf('function chaveDaRecorrencia');
    const fimMarcacao = visoes.indexOf('function todasRecorrenciasDaMudancaSaoExplicadas');
    const inicioLote = formulario.indexOf('async function corrigeRecorrenciasDuplicadasNoIntervalo');
    const fimLote = formulario.indexOf('\n}', inicioLote) + 2;
    if (inicioMarcacao < 0 || fimMarcacao < 0 || inicioLote < 0 || fimLote < 2) {
        throw Error('Não encontrou a correção em lote de recorrência duplicada.');
    }
    const chamadasPatch = [];
    const contexto = {
        semAcento: valor => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
        categoriaDaComparacao: categ => categ ?? '',
        textoOuTraco: v => (v == null || v === '' ? '—' : v),
        ehLinhaReal: r => Number.isInteger(+r.id) && +r.id > 0 && !r._sid && !r._sim,
        dataISO: v => String(v ?? '').slice(0, 10),
        timestamp: v => new Date(String(v)).getTime(),
        Estado: { ciclos: [], lancamentos: [], simulando: false },
        atualizarLancamento: async (id, campos) => { chamadasPatch.push({ id, ...campos }); },
        reclassificaPeriodo: r => {
            const idx = contexto.Estado.ciclos.findIndex((c, i) =>
                r.data >= c.ini && (!contexto.Estado.ciclos[i + 1] || r.data < contexto.Estado.ciclos[i + 1].ini));
            r.periodoIdx = idx >= 0 ? idx : null;
        },
        limparCachesFinanceiros: () => {},
    };
    vm.createContext(contexto);
    vm.runInContext(`${visoes.slice(inicioMarcacao, fimMarcacao)}
${formulario.slice(inicioLote, fimLote)}
globalThis.corrigeRecorrenciasDuplicadasNoIntervalo = corrigeRecorrenciasDuplicadasNoIntervalo;`, contexto);
    return { contexto, chamadasPatch };
}

test('consolidar tudo em lote: corrige todas as ocorrências aplicáveis no intervalo, sem confirm(), registrando o PATCH de cada uma', async () => {
    const { contexto, chamadasPatch } = carregaCorrecaoEmLote();
    contexto.Estado.ciclos = [
        { ini: '2026-09-08' }, { ini: '2026-10-08' }, { ini: '2026-11-09' }, { ini: '2026-12-09' },
    ];
    contexto.Estado.lancamentos = [
        { id: 10, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', periodoIdx: 1, cred: false },
        { id: 11, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04', periodoIdx: 1, cred: false },
        { id: 12, nome: 'Mercado', categ: 'Casa', data: '2026-10-20', periodoIdx: 1, cred: false },
        { id: 13, nome: 'Internet', categ: 'Casa', data: '2026-11-10', periodoIdx: 2, cred: false },
        { id: 14, nome: 'Internet', categ: 'Casa', data: '2026-12-05', periodoIdx: 2, cred: false },
    ];
    const corrigidos = await contexto.corrigeRecorrenciasDuplicadasNoIntervalo(1, 2);
    assert.equal(corrigidos, 2);
    assert.deepEqual(chamadasPatch, [
        { id: 11, data: '2026-11-09' },
        { id: 14, data: '2026-12-09' },
    ]);
    const r11 = contexto.Estado.lancamentos.find(r => r.id == 11);
    assert.equal(r11.data, '2026-11-09');
    assert.equal(r11.periodoIdx, 2);   // reclassificado pro ciclo que a nova data cai
    const r14 = contexto.Estado.lancamentos.find(r => r.id == 14);
    assert.equal(r14.data, '2026-12-09');
    assert.equal(r14.periodoIdx, 3);
});

test('simulação (Estado.simulando) não faz PATCH nenhum, só ajusta em memória', async () => {
    const { contexto, chamadasPatch } = carregaCorrecaoEmLote();
    contexto.Estado.simulando = true;
    contexto.Estado.ciclos = [{ ini: '2026-10-08' }, { ini: '2026-11-09' }];
    contexto.Estado.lancamentos = [
        { id: 20, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', periodoIdx: 0, cred: false },
        { id: 21, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04', periodoIdx: 0, cred: false },
    ];
    const corrigidos = await contexto.corrigeRecorrenciasDuplicadasNoIntervalo(0, 0);
    assert.equal(corrigidos, 1);
    assert.deepEqual(chamadasPatch, []);
    assert.equal(contexto.Estado.lancamentos.find(r => r.id == 21).data, '2026-11-09');
});

test('marca só a(s) ocorrência(s) mais recente(s) do grupo duplicado, com a data do próximo ciclo', () => {
    const c = carregaMarcacao();
    const antiga = { id: 1, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05' };
    const recente = { id: 2, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04' };
    const outraCategoria = { id: 3, nome: 'Mercado', categ: 'Casa', data: '2026-10-08' };
    const debitos = [antiga, recente, outraCategoria];
    c.marcaOcorrenciasDuplicadasNoCiclo(debitos, { ini: '2026-11-09' });
    assert.equal(antiga._dupCiclo, undefined);
    assert.equal(recente._dupCiclo, '2026-11-09');
    assert.equal(outraCategoria._dupCiclo, undefined);
});

test('sem próximo ciclo cadastrado, não marca nada (não há pra onde mover)', () => {
    const c = carregaMarcacao();
    const antiga = { id: 1, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05' };
    const recente = { id: 2, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04' };
    c.marcaOcorrenciasDuplicadasNoCiclo([antiga, recente], undefined);
    assert.equal(antiga._dupCiclo, undefined);
    assert.equal(recente._dupCiclo, undefined);
});

test('mesmo mês (sem duplicidade real) ou linha sintética/simulada não marca', () => {
    const c = carregaMarcacao();
    const mesmoMes1 = { id: 1, nome: 'Mercado', categ: 'Casa', data: '2026-10-05' };
    const mesmoMes2 = { id: 2, nome: 'Mercado', categ: 'Casa', data: '2026-10-20' };
    const sintetica = { _sid: 'fat:0', nome: 'Seguro Residencial', categ: 'Casa', data: '2026-11-04' };
    const antigaReal = { id: 3, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05' };
    const debitos = [mesmoMes1, mesmoMes2, sintetica, antigaReal];
    c.marcaOcorrenciasDuplicadasNoCiclo(debitos, { ini: '2026-11-09' });
    assert.equal(mesmoMes1._dupCiclo, undefined);
    assert.equal(mesmoMes2._dupCiclo, undefined);
    assert.equal(sintetica._dupCiclo, undefined);
    assert.equal(antigaReal._dupCiclo, undefined);   // real mas sozinha no grupo: nada pra corrigir
});

test('limpa marca de um redesenho anterior antes de recalcular', () => {
    const c = carregaMarcacao();
    const r = { id: 1, nome: 'Seguro Residencial', categ: 'Casa', data: '2026-10-05', _dupCiclo: '2026-09-01' };
    c.marcaOcorrenciasDuplicadasNoCiclo([r], { ini: '2026-11-09' });
    assert.equal(r._dupCiclo, undefined);
});

test('vCiclo chama a marcação antes de montar os blocos, só com o próximo ciclo (Estado.ciclos[i+1])', () => {
    assert.match(visoes, /marcaOcorrenciasDuplicadasNoCiclo\(debitos, Estado\.ciclos\[i \+ 1\]\);/);
});

test('celData (tables.js) mostra o botão "↷" só pra linha real com _dupCiclo, fora da conta restrita', () => {
    assert.match(tabelas, /const corrige = r\._dupCiclo && ehLinhaReal\(r\) && !modoRestrito\(\)/);
    assert.match(tabelas, /class=corrigeDupData data-corrige-dup="\$\{escapeHtml\(String\(r\.id\)\)\}"/);
    assert.match(tabelas, /return `\$\{texto\}\$\{corrige\}`;/);
});

test('clique no botão pede confirmação, faz o PATCH com a guarda de simulação e reclassifica o período', () => {
    assert.match(interacoes, /const botao = e\.target\.closest\('\[data-corrige-dup\]'\);/);
    assert.match(interacoes, /if \(!r \|\| !r\._dupCiclo\) return;/);
    assert.match(interacoes, /if \(!confirm\(`"\$\{r\.nome \?\? ''\}" está duplicado neste ciclo\. Mover a data de \$\{dataBR\(r\.data\)\} para \$\{dataBR\(novaData\)\} \(1º dia do próximo ciclo\)\?`\)\) return;/);
    assert.match(interacoes, /if \(!Estado\.simulando && !r\._sim\) await atualizarLancamento\(r\.id, \{ data: novaData \}\);/);
    assert.match(interacoes, /r\.data = novaData;\s*\n\s*reclassificaPeriodo\(r\);\s*\n\s*desenhar\(\);/);
    assert.match(interacoes, /mostrarToast\('Falhou ao atualizar', err\.message\);/);
});

test('estilos: mesma cor âmbar do aviso "*" de Comparar, em botão circular em evidência', () => {
    assert.match(estilos, /\.corrigeDupData \{[\s\S]*?border: 1px solid #F0A83A;/);
    assert.match(estilos, /\.corrigeDupData \{[\s\S]*?border-radius: 50%;/);
});

test('regra documentada em REGRAS.md', () => {
    assert.match(regras, /a confirmação ao corrigir a data de uma recorrência duplicada no ciclo/);
    assert.match(regras, /a tabela Débito marca a\(s\) ocorrência\(s\) mais recente\(s\) do grupo \(a mais antiga fica como está\) com um botão "↷"/);
    assert.match(regras, /Um clique, com confirmação, move a `data` dessa linha pro 1º dia do PRÓXIMO ciclo/);
    assert.match(regras, /some sozinho se não houver próximo ciclo cadastrado ainda/);
});
