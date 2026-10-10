// Filtros, ordenação, seleção e renderização das tabelas.

// A barra não filtra mais por Pago nem Origem. Mantemos esta função como porta única para as
// tabelas e cálculos comuns, para uma eventual regra futura não espalhar acessos ao estado.
const filtrarLancamentos = () => Estado.lancamentos;

// ===================================================================
// ORDENAÇÃO DE TABELAS — cada tabela (id) guarda seu proprio estado
// ===================================================================
function ordenarLinhas(linhas, idTabela) {
    const { k: coluna, d: direcao } = estadoOrdenacao(idTabela);
    const tipo = COLS.find(c => c[0] == coluna)[2];
    const copia = [...linhas];
    copia.sort((a, b) => {
        const A = a[coluna], B = b[coluna];
        // prio sem valor preenchido equivale a "sem prioridade nenhuma" — nao a zero, que
        // seria a MAIOR prioridade; fica atras de qualquer numero real, em qualquer sentido
        // de ordenacao (ex.: pior que 999).
        const cmp = coluna == 'prio' ? ((A == null ? Infinity : +A) - (B == null ? Infinity : +B))
            : tipo == 'n' || tipo == 'b' || tipo == 'r' || tipo == 'vol' ? ((+A || 0) - (+B || 0))
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

// monta o <tr> de cabecalho de uma tabela, com a setinha de ordenacao na coluna ativa
function cabecalhoTabela(idTabela) {
    const cols = colunasAtivas(idTabela);
    const { k: colunaAtiva, d: direcao } = estadoOrdenacao(idTabela);
    const linhaTitulos = cols.map(([chave, rotulo, tipo]) => {
        const seta = colunaAtiva == chave ? (direcao == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';
        return `<th class="${tipo == 'n' ? 'n' : ''}" onclick="sortCol('${idTabela}','${chave}')">${rotulo}${seta}`;
    }).join('');
    // 2a linha do header: campo de busca por coluna, so nas colunas de texto (tipo 't').
    // Conta restrita (modo simples) não tem busca — só ordenar pelo cabeçalho.
    if (modoSimples()) return linhaTitulos;
    const filtroAtual = estadoFiltroTexto(idTabela);
    // colunas de texto + Valor tem campo de busca. Valor compara numero (ver
    // passaFiltroTexto), nao texto, mas a caixinha e' a mesma das outras colunas —
    // com a mesma mascara de dinheiro do cadastro por cima (ver filtrarColuna).
    const linhaBusca = '<tr class=filtros>' + cols.map(([chave, rotulo, tipo]) => tipo == 't' || chave == 'valor'
        ? `<th class="${tipo == 'n' ? 'n' : ''}"><input type=text ${chave == 'valor' ? 'inputmode=numeric ' : 'title="Digite \'vazio\' pra achar as linhas sem nada preenchido aqui" '}data-filtro="${idTabela}|${chave}" placeholder="Filtrar ${rotulo.toLowerCase()}…" value="${escapeHtml(filtroAtual[chave] ?? '')}" oninput="filtrarColuna('${idTabela}','${chave}',this)"></th>`
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
// Extrai somente a exclusão explícita de Categoria. A mesma leitura serve para o filtro
// da linha e para o saldo diário, sem deixar filtros visuais de outras colunas alterarem caixa.
function categoriaExcluidaDoFiltro(termo) {
    const normalizado = semAcento(termo);
    return normalizado.startsWith('!') ? normalizado.slice(1).trim() : '';
}

// O saldo cinza ao fim do dia acompanha exclusivamente `!Categoria`: é a única busca que
// remove movimentos da conta. A cópia protege o array carregado de qualquer mutação no render.
function baseParaSaldoDiario(idTabela) {
    const categoriaExcluida = idTabela == 'db'
        ? categoriaExcluidaDoFiltro(estadoFiltroTexto(idTabela).categ)
        : '';
    return categoriaExcluida
        ? Estado.lancamentos.filter(r => !semAcento(r.categ).includes(categoriaExcluida))
        : null;
}

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
        const texto = semAcento(r[coluna]);
        const termoNormalizado = semAcento(termo);
        // Termo especial "vazio" (sem acento/caixa, sozinho no campo) acha as linhas sem
        // nada preenchido naquela coluna — mesmo critério da célula "—" (ehVazioTextual).
        // Não combina com ! nem |: é um atalho isolado, igual aos outros desta função.
        if (termoNormalizado.trim() == 'vazio') return ehVazioTextual(r[coluna]);
        // Categorias podem ser compostas (por exemplo, "Casa, Reserva"). O ! é
        // propositalmente exclusivo deste campo para não mudar a busca literal de Nome
        // ou Frequência. ! isolado equivale a filtro vazio e evita ocultar toda a tabela.
        if (coluna == 'categ' && termoNormalizado.startsWith('!')) {
            const termoExcluido = categoriaExcluidaDoFiltro(termo);
            return !termoExcluido || !texto.includes(termoExcluido);
        }
        // '|' funciona como OU em qualquer coluna de texto: "Assinatura|Isabella" acha
        // linhas que contenham qualquer um dos termos, não só os dois juntos. '|' sozinho
        // ou com pedaços vazios equivale a filtro vazio, igual ao '!' isolado de Categoria.
        const termosOu = termoNormalizado.split('|').map(t => t.trim()).filter(Boolean);
        return !termosOu.length || termosOu.some(t => texto.includes(t));
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

// ===================================================================
// RENDERIZAÇÃO DE TABELAS
// ===================================================================
// chave de selecao de uma linha: usa o _sid sintetico (linha de fatura) ou o id real
const chaveSelecao = r => r._sid ? r._sid : (r.id != null ? String(r.id) : '');
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
// lancamentos REAIS (id do banco, da' pra dar PATCH); a conta restrita (modoRestrito)
// continua vendo so' texto, igual o Valor — qualquer outro dispositivo edita normalmente.
const celData = r => {
    const texto = ehLinhaReal(r) && !modoRestrito()
        ? `<span class="togData" data-tog-data="${escapeHtml(String(r.id))}" title="Editar data">${textoData(r)}</span>`
        : textoData(r);
    // _dupCiclo (marcado em marcaOcorrenciasDuplicadasNoCiclo, js/cycle-views.js): essa
    // ocorrência é a mais recente de uma recorrência que caiu 2x no mesmo ciclo. O botão
    // corrige com 1 clique, movendo pro 1º dia do próximo ciclo (handler data-corrige-dup
    // em interactions.js) — só pra linha real fora da conta restrita, mesma regra de edição.
    const corrige = r._dupCiclo && ehLinhaReal(r) && !modoRestrito()
        ? ` <button type=button class=corrigeDupData data-corrige-dup="${escapeHtml(String(r.id))}" title="Recorrência caiu 2x neste ciclo — mover pro 1º dia do próximo" aria-label="Mover esta ocorrência pro 1º dia do próximo ciclo">↷</button>`
        : '';
    return `${texto}${corrige}`;
};
const celNome = r => {
    const sim = r._sim ? '<span class=simIco title="Simulado">✦</span> ' : '';
    const nome = escapeHtml(textoOuTraco(r.nome));
    const fatRef = r.fatura;
    const badgeFatura = (ehTransferenciaFatura(r) && fatRef)
        ? ` <span class="tagFatura" title="Abate fatura">↳ Fat. ${nomePeriodoAbrev({ ini: fatRef })}</span>`
        : '';
    const texto = `${nome}${badgeFatura}`;
    return ehLinhaReal(r) && !modoRestrito()
        ? `${sim}<span class="togNome" data-tog-nome="${escapeHtml(String(r.id))}" title="Editar nome">${texto}</span>`
        : `${sim}${texto}`;
};
// Categoria e Frequência (colunas de texto livre/vocabulário controlado): mesmo esquema de
// clique-pra-editar do Nome/Data, só pra linha REAL e fora da conta restrita.
const celCateg = r => ehLinhaReal(r) && !modoRestrito()
    ? `<span class="togCateg" data-tog-categ="${escapeHtml(String(r.id))}" title="Editar categoria">${escapeHtml(textoOuTraco(r.categ))}</span>`
    : textoOuTraco(r.categ);
const celFreq = r => ehLinhaReal(r) && !modoRestrito()
    ? `<span class="togFreq" data-tog-freq="${escapeHtml(String(r.id))}" title="Editar frequência">${escapeHtml(textoOuTraco(r.freq))}</span>`
    : textoOuTraco(r.freq);
// Prioridade de elevação do Backlog pra um ciclo: numero livre que o usuario preenche na
// mao (1 = mais provavel, quanto maior menos chance, ex.: 999) — mesmo esquema de clique-
// pra-editar das demais colunas de texto/numero livre.
const celPrio = r => ehLinhaReal(r) && !modoRestrito()
    ? `<span class="togPrio" data-tog-prio="${escapeHtml(String(r.id))}" title="Editar prioridade de elevação">${escapeHtml(textoOuTraco(r.prio))}</span>`
    : textoOuTraco(r.prio);
// Observação (texto livre, qualquer anotação) e Canal (de onde a conta e' paga/consultada —
// ex.: o link do site da concessionária): mesmo esquema de clique-pra-editar das demais
// colunas livres. Canal ganha um ícone extra pra abrir o link numa aba nova quando o texto
// e' uma URL http(s) — clicar nele não entra em edição nem seleciona a linha (mesmo truque
// de stopPropagation de abrirDetalheCelComparar em cycle-views.js).
const celObs = r => ehLinhaReal(r) && !modoRestrito()
    ? `<span class="togObs" data-tog-obs="${escapeHtml(String(r.id))}" title="Editar observação">${escapeHtml(textoOuTraco(r.obs))}</span>`
    : textoOuTraco(r.obs);
const ehUrlHttp = texto => /^https?:\/\//i.test(String(texto ?? '').trim());
const celCanal = r => {
    const bruto = String(r.canal ?? '').trim();
    const textoVisivel = escapeHtml(textoOuTraco(r.canal));
    // Largura fixa (ver .togCanal/.celCanalTexto no CSS): o que nao couber vira "...", mas
    // continua clicavel pra editar o texto inteiro. A conta restrita/linha nao-real tambem
    // trunca, so' sem o clique de edicao.
    const texto = ehLinhaReal(r) && !modoRestrito()
        ? `<span class="togCanal" data-tog-canal="${escapeHtml(String(r.id))}" title="Editar canal">${textoVisivel}</span>`
        : `<span class=celCanalTexto>${textoVisivel}</span>`;
    if (!bruto) return texto;
    // Copiar sempre que houver texto — inclusive chave Pix, que nao e' um link pra abrir.
    // So' quando e' http(s) o botao de abrir aparece ao lado (ver handler em
    // interactions.js e ehUrlHttp acima). SEM stopPropagation aqui: o clique precisa
    // borbulhar até #out, onde o handler delegado (data-copiar-canal) faz a copia de
    // verdade — ele mesmo chama stopImmediatePropagation pra nao cair na selecao de linha.
    const copiar = ` <button type=button class=copiarCanal data-copiar-canal="${escapeHtml(String(r.id))}" title="Copiar" aria-label="Copiar">` +
        `<svg viewBox="0 0 24 24" width=13 height=13 fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round aria-hidden=true>` +
        `<rect x=9 y=9 width=11 height=11 rx=2 /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg></button>`;
    const link = ehUrlHttp(bruto)
        ? ` <a class=linkCanal href="${escapeHtml(bruto)}" target=_blank rel="noopener noreferrer" title="Abrir link" aria-label="Abrir link" onclick="event.stopPropagation()">` +
            `<svg viewBox="0 0 24 24" width=13 height=13 fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round aria-hidden=true>` +
            `<path d="M10 14 21 3" /><path d="M15 3h6v6" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg></a>`
        : '';
    return `${texto}${copiar}${link}`;
};

// monta as celulas <td> de uma linha, conforme o tipo de cada coluna. A edição por toque/
// clique (Valor, Pago, Data) é a mesma em qualquer dispositivo; só a conta restrita
// (modoRestrito) vê tudo como texto simples, nunca editável.
const celulasDaLinha = (r, idTabela) => colunasAtivas(idTabela).map(([chave, , tipo]) => chave == 'valor'
    ? (r._sug != null
        ? `<td class="n ${corValor(r._sug)}">${brl(r._sug)}`
        : (ehLinhaReal(r) && !modoRestrito() ? celValorEditavel(r) : celValorLancamento(r))).replace(/$/,
            r._saldo != null ? `<span class=sd>${brl(r._saldo)}</span>` : '')
    : tipo == 'b' ? `<td>${r[chave] == null ? '—'
        : (modoRestrito() ? `<span class="${r[chave] ? 'vd' : 'vm'}">${r[chave] ? 'Pago' : 'Aberto'}</span>`
            : `<span class="${r[chave] ? 'vd' : 'vm'} togPago" data-tog-pago="${escapeHtml(String(r.id))}" title="Alternar status">${r[chave] ? 'Pago' : 'Aberto'}</span>`)}`
    : `<td class="${tipo == 'n' ? 'n' : ''}">${chave == 'data'
            ? celData(r)
            : (chave == 'nome' ? celNome(r)
                : (chave == 'categ' ? celCateg(r)
                    : (chave == 'freq' ? celFreq(r)
                        : (chave == 'prio' ? celPrio(r)
                            : (chave == 'obs' ? celObs(r)
                                : (chave == 'canal' ? celCanal(r) : textoOuTraco(r[chave])))))))}`
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
        const saldo = saldoPorDia(baseParaSaldoDiario(idTabela));
        ordenadas.forEach((r, i) => {
            const d = dataISO(r.data);
            if (!d || d < SALDO_DESDE) return;
            const prox = ordenadas[i + 1];
            if (!prox || dataISO(prox.data) !== d) r._saldo = saldo[d];   // ultima do dia
        });
    }

    // O toque/clique na linha sempre serve para somar valores, em qualquer dispositivo.
    // Só a conta restrita (modoRestrito) tem a barra limitada a soma e Limpar.
    const podeSelecionar = selecionavel;
    return `<div class=wrap><table><thead><tr>${cabecalhoTabela(idTabela)}</thead><tbody>` +
        ordenadas.map(r => {
            const chave = chaveSelecao(r), marcada = podeSelecionar && chave && Estado.selecionados.has(chave);
            return `<tr class="${r._fat ? 'fat ' : ''}${r._sal ? 'sal ' : ''}${r._res ? 'res ' : ''}${r._sug != null ? 'sug ' : ''}${r._sim ? 'sim ' : ''}${marcada ? 'on' : ''}${podeSelecionar && chave ? ' pick' : ''}" data-sid="${podeSelecionar ? chave : ''}">` + celulasDaLinha(r, idTabela);
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
const renderBloco = (titulo, total, subtitulo, linhas, idTabela, selecionavel = false, extra = '', resumoTitulo = '', separadorTotal = ' · ') => {
    // 'extra' preenchido substitui o total no destaque: o titulo passa a exibir o que
    // falta pagar em evidencia, com o bruto de lado, apagado.
    const valor = extra.startsWith('<b') ? extra
        : `<b class="${corSoma(total)}">${brl(Math.abs(total))}</b>${extra}`;
    // Resumos em duas linhas substituem o único total quando a visão precisa distinguir
    // o retrato de hoje da projeção. Os demais blocos preservam o título compacto legado.
    const tituloCompleto = resumoTitulo
        ? `<span class=tituloBloco>${titulo}</span>${resumoTitulo}`
        : `${titulo}${separadorTotal}${valor}`;
    return blocoCasca(tituloCompleto, subtitulo, linhas.length, idTabela,
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
