// Filtros, ordenação, seleção e renderização das tabelas.

const passaFiltroTriEstado = (idSelect, valor) => {
    const v = el(idSelect).value;
    return v == 'B' || (v == 'S') == !!valor;
};
// Aplica os filtros de situação e origem sobre a lista de lançamentos.
const filtrarLancamentos = () => Estado.lancamentos.filter(r =>
    passaFiltroTriEstado('fpago', r.pago) &&
    ({ A: 1, D: !r.cred, F: r.cred })[el('origem').value]
);

// ===================================================================
// ORDENAÇÃO DE TABELAS — cada tabela (id) guarda seu proprio estado
// ===================================================================
function ordenarLinhas(linhas, idTabela) {
    const { k: coluna, d: direcao } = estadoOrdenacao(idTabela);
    const tipo = COLS.find(c => c[0] == coluna)[2];
    const copia = [...linhas];
    copia.sort((a, b) => {
        const A = a[coluna], B = b[coluna];
        const cmp = tipo == 'n' || tipo == 'b' || tipo == 'r' || tipo == 'vol' ? ((+A || 0) - (+B || 0))
            : tipo == 'd' ? (timestamp(A) - timestamp(B))
                : String(A ?? '').localeCompare(String(B ?? ''), 'pt');
        const ordenado = direcao == 1 ? cmp : -cmp;
        if (ordenado) return ordenado;
        // saldo anterior sempre encabeca o dia: ele e' o ponto de partida, nao um evento
        if (a._sal !== b._sal) return a._sal ? -1 : 1;
        return (b.v || 0) - (a.v || 0);
    });
    return copia;
}

function atualizaAvisoFronteira() {
    // A fatura e' escolhida manualmente no formulario; nao existe mais aviso de fechamento.
    el('avisoFr').hidden = true;
}

// monta o <tr> de cabecalho de uma tabela, com a setinha de ordenacao na coluna ativa
function cabecalhoTabela(idTabela) {
    const cols = colunasAtivas();
    const { k: colunaAtiva, d: direcao } = estadoOrdenacao(idTabela);
    const linhaTitulos = cols.map(([chave, rotulo, tipo]) => {
        const seta = colunaAtiva == chave ? (direcao == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';
        return `<th class="${tipo == 'n' ? 'n' : ''}" onclick="sortCol('${idTabela}','${chave}')">${rotulo}${seta}`;
    }).join('');
    // 2a linha do header: campo de busca por coluna, so nas colunas de texto (tipo 't').
    // Modo simples no mobile não tem busca — só ordenar pelo cabeçalho.
    if (modoSimples()) return linhaTitulos;
    const filtroAtual = estadoFiltroTexto(idTabela);
    // colunas de texto + Valor tem campo de busca. Valor compara numero (ver
    // passaFiltroTexto), nao texto, mas a caixinha e' a mesma das outras colunas —
    // com a mesma mascara de dinheiro do cadastro por cima (ver filtrarColuna).
    const linhaBusca = '<tr class=filtros>' + cols.map(([chave, rotulo, tipo]) => tipo == 't' || chave == 'valor'
        ? `<th class="${tipo == 'n' ? 'n' : ''}"><input type=text ${chave == 'valor' ? 'inputmode=numeric ' : ''}data-filtro="${idTabela}|${chave}" placeholder="Filtrar ${rotulo.toLowerCase()}…" value="${escapeHtml(filtroAtual[chave] ?? '')}" oninput="filtrarColuna('${idTabela}','${chave}',this)"></th>`
        : '<th>'
    ).join('');
    return linhaTitulos + linhaBusca;
}
// chamado a cada tecla digitada num campo de busca de coluna.
// desenhar() reescreve o innerHTML inteiro, o que tiraria o foco do campo a cada letra —
// por isso guarda onde estava o cursor e restaura depois, achando o campo novo pelo
// data-filtro (que sobrevive ao redesenho, ja que e' remontado igual).
window.filtrarColuna = (idTabela, coluna, input) => {
    // Valor usa a MESMA mascara de dinheiro do cadastro (formataMascaraDinheiro): os
    // digitos vao empurrando as casas decimais, tipo caixa eletronico. Assim a caixinha
    // mostra exatamente o numero procurado — digitar "15000" vira "150,00", sem duvida
    // sobre onde caem os centavos. Campo esvaziado tem que voltar pra vazio (filtro
    // desligado), nunca virar "0,00" — que filtraria pelos valores zerados.
    if (coluna == 'valor') {
        const cursorNoFim = input.selectionEnd == input.value.length;
        input.value = input.value.replace(/\D/g, '') ? formataMascaraDinheiro(input.value) : '';
        if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
    }
    estadoFiltroTexto(idTabela)[coluna] = input.value;
    const posicaoCursor = document.activeElement === input ? input.selectionStart : null;
    desenhar();
    const novoInput = document.querySelector(`[data-filtro="${idTabela}|${coluna}"]`);
    if (novoInput) { novoInput.focus(); if (posicaoCursor != null) novoInput.setSelectionRange(posicaoCursor, posicaoCursor); }
};
// remove acentos e caixa: "Café" e "cafe" viram a mesma coisa pra comparar
// uma linha passa no filtro de texto da tabela se contem (ignorando acento e maiuscula) todos os termos digitados
function passaFiltroTexto(r, idTabela) {
    const filtro = estadoFiltroTexto(idTabela);
    return Object.entries(filtro).every(([coluna, termo]) => {
        if (!termo) return true;
        // Valor nao e' texto: o campo sempre traz um numero ja mascarado (formataMascaraDinheiro),
        // entao compara por PROXIMIDADE em vez de substring — acha qualquer lancamento a ate
        // 5 centavos do valor digitado, pra nao exigir acertar o centavo exato. Ignora o sinal
        // dos dois lados (a mascara nao digita "-"): buscar "150" acha tanto -150 quanto +150.
        // Linha de Investimento sugerido mostra r._sug no lugar de r.v — busca no que esta visivel.
        if (coluna == 'valor') {
            const alvo = valorMascaraParaNumero(termo);
            const valorLinha = Math.abs(r._sug != null ? r._sug : (r.v || 0));
            return Math.abs(valorLinha - alvo) <= TOLERANCIA_BUSCA_VALOR;
        }
        return semAcento(r[coluna]).includes(semAcento(termo));
    });
}
// clique no header: 1o clique ordena asc, 2o desc, alternando (sem 3o estado "original")
window.sortCol = (idTabela, coluna) => {
    const estado = estadoOrdenacao(idTabela);
    if (estado.k != coluna) { estado.k = coluna; estado.d = 1; }
    else estado.d = estado.d == 1 ? 2 : 1;
    desenhar();
};

// clique no header da matriz Comparar: alterna asc/desc na mesma coluna, ou troca
// de coluna comecando por desc (o mais relevante costuma ser o maior valor)
window.sortComp = k => {
    const oc = Estado.ordComp;
    if (oc.k != k) { oc.k = k; oc.d = k == 'chave' ? 1 : 2; }
    else oc.d = oc.d == 1 ? 2 : 1;
    desenhar();
};

['fData', 'fNome', 'fCred'].forEach(id =>
    el(id).addEventListener('change', atualizaAvisoFronteira));
el('fNome').addEventListener('input', atualizaAvisoFronteira);

// ===================================================================
// RENDERIZAÇÃO DE TABELAS
// ===================================================================
// chave de selecao de uma linha: usa o _sid sintetico (linha de fatura) ou o id real
const chaveSelecao = r => r._sid ? r._sid : (r.id != null ? String(r.id) : '');
// no mobile a cor do Valor muda de sentido: nao e' mais sinal (saida/entrada), e' status de
// pagamento (pago = verde, em aberto = vermelho). No desktop continua sendo o sinal (celValor).
// a linha sintetica "Fatura do cartao" nao tem 'pago' (nao vem do banco) -> cai em vermelho
// por padrao, o que e' aceitavel: ela representa uma saida que ainda vai vencer
const celValorMobile = r => `<td class="n ${r.pago ? 'vd' : 'vm'}">${brl(r.v)}`;
// texto de uma celula "vazia": trata null/undefined/"" E a string literal "null"/"undefined"
// que pode ter ficado gravada no banco por engano em alguma insercao anterior
// mesma logica de limpeza do valorValido: reconhece "null", "<null>", "n/a" etc como vazio
const ehVazioTextual = v => {
    if (v == null) return true;
    const limpo = String(v).trim().toLowerCase().replace(/^<|>$/g, '');
    return ['', 'null', 'undefined', 'nan', 'none', 'n/a'].includes(limpo);
};
const textoOuTraco = v => ehVazioTextual(v) ? '—' : v;
// linha REAL (existe na tabela lancamentos, da' pra dar PATCH): nao e' sintetica (fatura,
// saldo anterior, resgate/aporte) nem simulada (so' memoria, nunca foi salva)
const ehLinhaReal = r => Number.isInteger(+r.id) && +r.id > 0 && !r._sid && !r._sim;
// conteudo da celula Data: DD/MM/AAAA ou '—'. A fatura e' escolhida manualmente,
// portanto nao existe mais marca de fechamento/D+1.
const textoData = r => r.data ? dataBR(r.data) : '—';
// mesma ideia de celValorEditavel: clicar abre um <input type=date> inline. So' pra
// lancamentos REAIS (id do banco, da' pra dar PATCH) e so' no desktop — no mobile a
// celula continua sendo so' texto, igual o Valor.
const celData = r => ehLinhaReal(r) && !isMobile()
    ? `<span class="togData" data-tog-data="${escapeHtml(String(r.id))}" title="Editar data">${textoData(r)}</span>`
    : textoData(r);
const celNome = r => {
    const sim = r._sim ? '<span class=simIco title="Simulado">✦</span> ' : '';
    const nome = escapeHtml(textoOuTraco(r.nome));
    const fatRef = r.fatura || r.fatura_id;
    const badgeFatura = (ehTransferenciaFatura(r) && fatRef)
        ? ` <span class="tagFatura" title="Abate fatura">↳ Fat. ${nomePeriodoAbrev({ ini: fatRef })}</span>`
        : '';
    return `${sim}${nome}${badgeFatura}`;
};

// monta as celulas <td> de uma linha, conforme o tipo de cada coluna
const celulasDaLinha = r => colunasAtivas().map(([chave, , tipo]) => chave == 'valor'
    ? (r._sug != null
        ? `<td class="n ${corValor(r._sug)}">${brl(r._sug)}`
        : (isMobile() ? celValorMobile(r) : (ehLinhaReal(r) ? celValorEditavel(r) : celValor(r.v)))).replace(/$/,
            r._saldo != null ? `<span class=sd>${brl(r._saldo)}</span>` : '')
    : tipo == 'b' ? `<td>${r[chave] == null ? '—'
        : (isMobile() ? `<span class="${r[chave] ? 'vd' : 'vm'}">${r[chave] ? 'Pago' : 'Aberto'}</span>`
            : `<span class="${r[chave] ? 'vd' : 'vm'} togPago" data-tog-pago="${escapeHtml(String(r.id))}" title="Alternar status">${r[chave] ? 'Pago' : 'Aberto'}</span>`)}`
    : `<td class="${tipo == 'n' ? 'n' : ''}">${chave == 'data'
            ? celData(r)
            : (chave == 'nome' ? celNome(r) : textoOuTraco(r[chave]))}`
).join('');
// renderiza uma tabela completa (cabecalho + linhas). 'selecionavel' liga o clique-pra-somar por linha.
const renderTabela = (linhasBrutas, idTabela, selecionavel) => {
    const linhas = linhasBrutas.filter(r => passaFiltroTexto(r, idTabela));
    if (!linhasBrutas.length) { Estado.linhasVisiveis[idTabela] = []; return '<p class=empty>Vazio</p>'; }
    if (!linhas.length) { Estado.linhasVisiveis[idTabela] = []; return `<div class=wrap><table><thead><tr>${cabecalhoTabela(idTabela)}</thead></table></div><p class=empty>Nenhum resultado com esse filtro.</p>`; }
    const ordenadas = ordenarLinhas(linhas, idTabela);
    // guarda na ordem REAL da tela (pos-ordenacao) — usado por "Selecionar tudo" e pelo
    // shift-click de intervalo, que dependem do indice bater com a posicao visual.
    Estado.linhasVisiveis[idTabela] = ordenadas;

    // saldo do dia: so na tabela de Debito e so com data ASCENDENTE — em qualquer outra
    // ordem "fim do dia" nao corresponde ao que esta na tela. Marca DEPOIS de ordenar,
    // na ultima linha de cada dia como ela realmente aparece.
    const ord = estadoOrdenacao(idTabela);
    ordenadas.forEach(r => { r._saldo = null; });
    if (idTabela == 'db' && ord.k == 'data' && ord.d == 1) {
        const saldo = saldoPorDia();
        ordenadas.forEach((r, i) => {
            const d = dataISO(r.data);
            if (!d || d < SALDO_DESDE) return;
            const prox = ordenadas[i + 1];
            if (!prox || dataISO(prox.data) !== d) r._saldo = saldo[d];   // ultima do dia
        });
    }

    // Mobile é consulta: não monta chaves selecionáveis nem a barra de ações que delas depende.
    const podeSelecionar = selecionavel && !isMobile();
    return `<div class=wrap><table><thead><tr>${cabecalhoTabela(idTabela)}</thead><tbody>` +
        ordenadas.map(r => {
            const chave = chaveSelecao(r), marcada = podeSelecionar && chave && Estado.selecionados.has(chave);
            return `<tr class="${r._fat ? 'fat ' : ''}${r._sal ? 'sal ' : ''}${r._res ? 'res ' : ''}${r._sug != null ? 'sug ' : ''}${r._sim ? 'sim ' : ''}${marcada ? 'on' : ''}${podeSelecionar && chave ? ' pick' : ''}" data-sid="${podeSelecionar ? chave : ''}">` + celulasDaLinha(r);
        }).join('') + '</tbody></table></div>';
};

// casca comum de TODOS os blocos (Débito/Crédito/Backlog/Comparar): titulo com botao
// de collapse + linha de meta info + corpo por baixo. E' a MESMA estrutura/diagramacao
// pra todo mundo, inclusive o collapse (▾/▸, Estado.fechados[idTabela]) — assim trocar
// de visao (Ciclo <-> Comparar) fica impercetivel, os blocos sao visualmente identicos.
// 'corpoFn' e' chamada so' quando o bloco esta aberto (evita montar a tabela/matriz a
// toa quando esta fechado).
function blocoCasca(tituloHtml, subtitulo, n, idTabela, corpoFn) {
    const fechado = !!Estado.fechados[idTabela];
    const btnTog = `<button type=button class=tog onclick="alternarBloco('${idTabela}')" aria-label="${fechado ? 'Expandir' : 'Recolher'}">${fechado ? '▸' : '▾'}</button>`;
    const corpo = fechado ? '' : corpoFn();
    return `<div class=blk><h3>${btnTog}${tituloHtml}</h3><p class=meta>${n} ${n == 1 ? 'registro' : 'registros'} · ${subtitulo}</p>${corpo}</div>`;
}

// um card "Débito"/"Crédito"/"Backlog": titulo + total, subtitulo, tabela por baixo.
// quando selecionavel, ganha um botao "Selecionar tudo" que marca/desmarca todas as linhas
// dessa tabela de uma vez (respeitando o filtro de texto ativo, se houver).
// "Ver gráfico" mora na toolbar (#btGrafico), nao mais aqui.
const renderBloco = (titulo, total, subtitulo, linhas, idTabela, selecionavel = false, extra = '') => {
    // 'extra' preenchido substitui o total no destaque: o titulo passa a exibir o que
    // falta pagar em evidencia, com o bruto de lado, apagado.
    const valor = extra.startsWith('<b') ? extra
        : `<b class="${corSoma(total)}">${brl(Math.abs(total))}</b>${extra}`;
    return blocoCasca(`${titulo} · ${valor}`, subtitulo, linhas.length, idTabela,
        () => renderTabela(linhas, idTabela, selecionavel));
};



// ===================================================================
// AS TRÊS VISÕES: Ciclo, Comparar, Investimento
// ===================================================================

// alocacaoAntecipacoes ja varre TODOS os periodos sozinha (e' O(periodos*lancamentos)) —
// chama-la de novo pra cada ciclo individual faz o custo virar O(periodos^2*lancamentos),
// que com uma tabela de periodos grande (ex: 1000 linhas) trava o navegador por dezenas de
// segundos. Por isso ela e' calculada UMA VEZ POR RENDER aqui, memoizada por base, e
// reaproveitada — nunca chamada dentro de um loop por idx.
// Cálculos financeiros foram movidos para js/finance.js.
