// Redesenho, seleção, edição e comandos da interface.

// Controlador da interface: comandos, modais, gráficos, formulário e boot.

// redesenha a tela conforme o modo ativo (blocos Debito/Credito vs matriz de comparacao),
// escondendo/mostrando os filtros que fazem sentido em cada um
function desenhar() {
    console.time('[diag] desenhar');
    Object.keys(_cacheSaldo).forEach(k => delete _cacheSaldo[k]);
    Object.keys(_cacheAjuste).forEach(k => delete _cacheAjuste[k]);
    Object.keys(_cacheSaldoUnico).forEach(k => delete _cacheSaldoUnico[k]);
    Object.keys(_cacheAjusteUnico).forEach(k => delete _cacheAjusteUnico[k]);
    _baseFiltrada = _abatFiltrada = _baseUnica = _abatUnica = null;   // recalcula 1x neste render
    const simples = modoSimples();

    el('fciclo').hidden = true;   // #ciclo e' so' a fonte de verdade interna que vCiclo() le, nunca aparece

    // ao nao ter De/Ate escolhidos ainda (1a carga), pre-preenche com o ciclo ATUAL nos
    // dois — abre direto no modo blocos do mes corrente (De=Ate=atual), igual o botao
    // "Atual" faz e igual a visao Ciclo antiga sempre abria
    if (!el('compDe').value && !el('compAte').value && Estado.idxHoje >= 0) {
        el('compDe').value = Estado.idxHoje;
        el('compAte').value = Estado.idxHoje;
    }

    // "modo blocos" (De==Ate, De=Backlog, ou modo simples — mobile/Isabella sempre
    // navegam ciclo a ciclo) delega a tela pra vCiclo() (via vComp()); fora disso e'
    // "modo matriz". So' existe esse UM criterio — a antiga visao "Ciclo"/"Comparar"
    // separada foi removida, unificada dentro do fluxo Comparar (De==Ate cobre
    // exatamente o que a visao Ciclo cobria), e o navegador ‹›Atual tambem saiu — De/Ate
    // ficam sempre visiveis, e Backlog e' so' mais uma opcao do De.
    if (simples && el('compDe').value !== el('compAte').value) {
        // simples troca pro ciclo ATUAL (nunca deixa De != Ate escapar pro modo simples)
        const idx = Estado.idxHoje >= 0 ? Estado.idxHoje : 0;
        el('compDe').value = idx; el('compAte').value = idx;
    }
    const ehBacklog = el('compDe').value == '-1';
    const modoBlocos = ehBacklog || (!!el('compDe').value && el('compDe').value == el('compAte').value);
    // Backlog nao compara com outro periodo — o Ate fica desabilitado e ignorado
    // enquanto o De for Backlog (nao da' pra escolher um Ate junto com Backlog).
    el('compAte').disabled = ehBacklog;
    if (modoBlocos) el('ciclo').value = ehBacklog ? -1 : el('compDe').value;   // vCiclo() le o combo interno

    // Origem so faz sentido comparando a matriz de verdade (2+ periodos) — some de
    // verdade (hidden) fora do fluxo, sem deixar buraco reservado, mas com um fade suave
    // em vez de corte seco.
    mostraComFade('forigem', !modoBlocos && !simples);
    if (modoBlocos) el('origem').value = 'A';
    el('ftit').hidden = simples;
    el('fvalWrap').hidden = simples;
    if (simples) el('fvalor').value = 'T';
    el('flimpar').hidden = simples;   // no modo simples quase nao ha filtro pra limpar
    if (simples) {
        el('fsit').hidden = el('fativoWrap').hidden = true;
        el('fpago').value = 'B'; el('fativo').value = 'S';   // ve tudo (pago+aberto), so os ativos
    }
    const noBacklog = modoBlocos && +el('ciclo').value < 0;
    if (!simples) el('fativo').value = noBacklog ? 'B' : 'S';
    if (!modoBlocos) el('origem').value = 'A';

    // "Ver gráfico" so faz sentido com um ciclo de verdade selecionado (fora do Backlog,
    // que nao tem periodo pra desenhar a pizza).
    mostraComFade('fgraf', modoBlocos && !simples && !noBacklog);
    el('btGrafico').dataset.idx = el('ciclo').value;
    el('btMetaReservaEmergencia').dataset.idx = el('ciclo').value;
    mostraComFade('fevol', !modoBlocos && !simples && !!el('compDe').value && !!el('compAte').value);

    // fade suave SO' quando muda de modo (blocos <-> matriz) — nao em todo redesenho
    // (ex: digitar num filtro de texto), senao a tela piscaria a cada tecla
    const trocouModo = Estado._modoBlocosAnterior != null && Estado._modoBlocosAnterior != modoBlocos;
    Estado._modoBlocosAnterior = modoBlocos;
    // #out.innerHTML e' reescrito do zero a cada desenhar() (ex: a cada linha marcada
    // no shift-click) — sem isso, o scroll INTERNO de cada tabela (.wx/.wrap tem
    // overflow:auto proprio) e' perdido a cada redesenho, dando a impressao de que a
    // tabela "reseta" a visao no meio de um shift-click. Guarda a posicao de cada
    // container rolavel (por indice — o mesmo modo gera os mesmos blocos, na mesma
    // ordem, entre um redesenho e outro) e restaura depois, exceto ao trocar de modo
    // de verdade (blocos <-> matriz), onde nao ha posicao antiga que faca sentido.
    const scrollsAntigos = [...el('out').querySelectorAll('.wx, .wrap')].map(e => [e.scrollTop, e.scrollLeft]);
    el('out').innerHTML = modoBlocos ? vCiclo() : vComp();
    if (!trocouModo) {
        [...el('out').querySelectorAll('.wx, .wrap')].forEach((e, i) => {
            if (!scrollsAntigos[i]) return;
            [e.scrollTop, e.scrollLeft] = scrollsAntigos[i];
        });
    }
    // "Somente Diferentes" so faz sentido comparando EXATAMENTE 2 periodos — vComp()
    // deixa a informacao pronta em Estado._comparacao2Periodos como efeito colateral,
    // porque so' ali se sabe quantos periodos a matriz de fato usou.
    mostraComFade('fdif', !modoBlocos && !simples && !!Estado._comparacao2Periodos);
    if (trocouModo) {
        el('out').classList.remove('fadeIn');
        void el('out').offsetWidth;   // forca reflow pra reiniciar a animacao mesmo se ja rodou antes
        el('out').classList.add('fadeIn');
    }
    // limpa a selecao SO' na troca de modo (blocos <-> matriz) — as chaves de selecao de
    // um lado nao existem no outro (linhas reais do Ciclo vs categorias "cp:" do Comparar),
    // mas dentro do MESMO modo a selecao tem que sobreviver a redesenhos normais (trocar
    // filtro, digitar em busca, etc), senao a barra de soma nunca fica de pe' no Comparar.
    if (trocouModo) Estado.selecionados.clear();
    if (typeof atualizaBarraSelecao == 'function') atualizaBarraSelecao();
    if (typeof atualizaBtCicloHoje == 'function') atualizaBtCicloHoje();
    if (typeof atualizaBtsNavCiclo == 'function') atualizaBtsNavCiclo();
    console.timeEnd('[diag] desenhar');
}

// ===================================================================
// SELEÇÃO DE LINHAS (barra flutuante de soma)
// ===================================================================
function atualizaBarraSelecao() {
    // No mobile a visão é estritamente de consulta: descarta eventual seleção herdada do desktop.
    if (isMobile()) {
        Estado.selecionados.clear();
        el('selbar').style.display = 'none';
        return;
    }
    if (!Estado.selecionados.size) { el('selbar').style.display = 'none'; return; }

    const chaves = [...Estado.selecionados.keys()];
    // Linhas sinteticas nao existem no banco e, por isso, nao podem ser duplicadas nem
    // excluidas. As excecoes de ACAO sao os ajustes "sug:" e "res:": Aporte sugerido
    // e Resgate necessario podem ser materializados como lancamentos reais.
    const ehSintetica = c => PREFIXO_LINHA_SINTETICA.test(c);
    const chaveUnica = chaves.length == 1 ? chaves[0] : null;
    const ehAjusteMaterializavel = !!chaveUnica && /^(sug|res):/.test(chaveUnica);
    const ajusteExistente = ehAjusteMaterializavel
        ? movimentoAporteOuResgateDoCiclo(indiceDoAjuste(chaveUnica))
        : null;
    const chaveUnicaReal = chaveUnica && !ehSintetica(chaveUnica) ? chaveUnica : null;

    // uma linha real: a barra e' so pra duplicar. Varias (ou uma sintetica sozinha): e'
    // pra somar e selecionar/limpar. Nunca os dois juntos — pra desmarcar uma linha unica,
    // basta clicar nela de novo. Selecao multipla + soma funciona igual em qualquer
    // tela desktop — a seleção nunca aparece no mobile e não depende do modo simples.
    el('seldup').hidden = !chaveUnicaReal && !ehAjusteMaterializavel;
    el('seldup').textContent = ehAjusteMaterializavel
        ? (ajusteExistente ? 'Consolidar' : 'Materializar')
        : 'Duplicar';
    el('seldel').hidden = !chaveUnicaReal;
    el('selacao').hidden = !!chaveUnicaReal || ehAjusteMaterializavel;

    if (chaveUnica) {
        const r = linhaDaChaveSelecao(chaveUnica);
        el('selinfo').innerHTML =
            `<span class=cnt>Selecionado</span>` +
            `<span class="val ${corValor(r?.v || 0)}">${escapeHtml(r?.nome ?? '')}</span>`;
    } else {
        let soma = 0;
        for (const v of Estado.selecionados.values()) soma += v;
        el('selinfo').innerHTML =
            `<span class=cnt>${Estado.selecionados.size} selecionados</span>` +
            `<span class="val ${corSoma(soma)}">${brl(soma)}</span>`;
        el('selacao').textContent = 'Limpar';
    }

    el('selbar').style.display = 'flex';
}
// Resolve tanto lancamentos reais quanto linhas sinteticas que so existem nas tabelas
// renderizadas (ex.: Aporte sugerido). Centralizar isso tambem garante que a barra mostre
// nome/valor dessas linhas em vez de tentar acha-las apenas em Estado.lancamentos.
function linhaDaChaveSelecao(chave) {
    for (const linhas of Object.values(Estado.linhasVisiveis)) {
        const r = linhas.find(x => chaveSelecao(x) === chave);
        if (r) return r;
    }
    return Estado.lancamentos.find(x => String(x.id) === chave) || null;
}

const indiceDoAjuste = chave => {
    const achou = /^(?:sug|res):(\d+)$/.exec(chave || '');
    return achou ? +achou[1] : null;
};

// Uma sugestao so' pode consolidar com um movimento real de Aporte/Resgate do MESMO
// ciclo. Investimentos com outro nome continuam independentes: nunca devem ser alterados
// pela acao de materializar.
function movimentoAporteOuResgateDoCiclo(idx) {
    return Estado.lancamentos
        .filter(r => ehLinhaReal(r) && !r.cred && r.inv && r.periodoIdx === idx)
        .filter(r => /^(aporte|resgate)\b/.test(semAcento(String(r.nome || '')).trim()))
        .sort((a, b) => timestamp(a.data) - timestamp(b.data) || (+a.id - +b.id))[0] || null;
}

function valorArredondado(valor) {
    const resultado = Math.round(valor * 100) / 100;
    return Math.abs(resultado) < 0.005 ? 0 : resultado;
}

// Soma o ajuste ao movimento que ja existe. Sinais iguais acumulam; sinais opostos
// se abatem. Se inverter o sinal, o nome tambem acompanha a direcao que restou.
function consolidarAjusteExistente(existente, valorAjuste) {
    const valor = valorArredondado((existente?.v || 0) + valorAjuste);
    return {
        valor,
        nome: valor < 0 ? 'Aporte' : valor > 0 ? 'Resgate' : (existente?.nome || 'Aporte'),
    };
}

// valor de uma linha a partir da sua chave de selecao (linha real ou fatura sintetica)
function valorDaChave(chave) {
    // Fatura sintetica
    if (chave.startsWith('fat:')) {
        return Estado.valorFaturaPorCiclo[chave] || 0;
    }

    // Procura primeiro nas linhas atualmente renderizadas.
    // Isso inclui Saldo do mês anterior, Resgate necessário
    // e Investimento sugerido, que não existem em Estado.lancamentos.
    const visivel = linhaDaChaveSelecao(chave);
    if (visivel) return visivel._sug != null ? visivel._sug : (visivel.v || 0);

    // Linha real vinda do banco
    const r = Estado.lancamentos.find(x => String(x.id) === chave);
    return r ? (r.v || 0) : 0;
}
function alternarSelecao(chave) {
    if (!chave) return;
    const jaEstava = Estado.selecionados.has(chave);
    if (jaEstava) Estado.selecionados.delete(chave);
    else Estado.selecionados.set(chave, valorDaChave(chave));
    Estado.ultimaClicada = chave;
    desenhar();
}

// shift-click: aplica na linha atual o intervalo entre ela e a ultima linha clicada,
// dentro da MESMA tabela (respeitando a ordem em que as linhas estao na tela agora).
// A ACAO (marcar ou desmarcar) segue o que um clique normal faria na linha atual: se ela
// ja estava marcada, o shift desmarca o intervalo inteiro; senao, marca o intervalo inteiro.
function selecionarIntervalo(idTabela, chave) {
    const linhas = (Estado.linhasVisiveis[idTabela] || []).map(chaveSelecao).filter(Boolean);
    const iAtual = linhas.indexOf(chave);
    const iAncora = linhas.indexOf(Estado.ultimaClicada);
    if (iAtual < 0 || iAncora < 0) { alternarSelecao(chave); return; }
    const desmarcando = Estado.selecionados.has(chave);
    const [ini, fim] = iAncora <= iAtual ? [iAncora, iAtual] : [iAtual, iAncora];
    for (let i = ini; i <= fim; i++) {
        const c = linhas[i];
        if (desmarcando) Estado.selecionados.delete(c);
        else if (!Estado.selecionados.has(c)) Estado.selecionados.set(c, valorDaChave(c));
    }
    Estado.ultimaClicada = chave;
    desenhar();
}

window.alternarBloco = idTabela => {
    Estado.fechados[idTabela] = !Estado.fechados[idTabela];
    if (Estado.fechados[idTabela]) {
        (Estado.linhasVisiveis[idTabela] || []).map(chaveSelecao).filter(Boolean)
            .forEach(c => Estado.selecionados.delete(c));
        Estado.linhasVisiveis[idTabela] = [];
    }
    desenhar();
};

// clique no badge "Pago"/"Aberto" alterna o status na hora, sem selecionar a linha (o
// listener de selecao abaixo esta no MESMO #out — precisa vir ANTES e parar a propagacao,
// senao o clique tambem selecionaria a linha inteira por baixo do badge).
el('out').addEventListener('click', async e => {
    const badge = e.target.closest('[data-tog-pago]');
    if (!badge) return;
    if (isMobile()) return;
    // stopPropagation NAO basta aqui: os dois listeners estao no MESMO elemento (#out),
    // entao ambos disparam na mesma fase de bubbling nao importa o que este pare de
    // propagar — precisa de stopImmediatePropagation pra impedir o listener de selecao
    // (registrado logo abaixo, no mesmo #out) de rodar tambem.
    e.stopImmediatePropagation();

    const id = badge.dataset.togPago;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const novoPago = !r.pago;
    badge.classList.toggle('vd', novoPago);
    badge.classList.toggle('vm', !novoPago);
    badge.textContent = novoPago ? 'Pago' : 'Aberto';
    badge.style.opacity = .5;   // feedback imediato enquanto o PATCH esta no ar

    try {
        if (!r._sim) await atualizarLancamento(r.id, { pago: novoPago });
        r.pago = novoPago;
        desenhar();
    } catch (err) {
        badge.style.opacity = '';
        alert('Falhou ao atualizar: ' + err.message);
        desenhar();   // redesenha pra garantir que o badge volta a refletir o estado real
    }
});

// clique no Valor troca o <span> por um <input> mascarado (mesma mascara do form de
// lancamento), focado e com o texto ja selecionado. Enter ou blur confirma; Escape
// cancela sem salvar. Mesmo esquema do toggle Pago acima: stopImmediatePropagation pra
// nao disparar a selecao da linha por baixo.
el('out').addEventListener('click', e => {
    const span = e.target.closest('[data-tog-valor]');
    if (!span) return;
    if (isMobile()) return;
    // ja esta em edicao (input aberto): so' impede o clique de vazar pra selecao de
    // linha por baixo — o proprio <input> cuida do cursor/foco nativamente.
    if (span.classList.contains('editando')) { e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();

    const id = span.dataset.togValor;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const bruto = Math.abs(r.v || 0);
    const negativo = (r.v || 0) < 0;
    span.classList.add('editando');
    span.innerHTML = `<span class=inpValorSinal>${negativo ? '−' : '+'}</span>` +
        `<input type=text inputmode=numeric class=inpValor value="${bruto ? formataMascaraDinheiro(String(Math.round(bruto * 100))) : ''}" placeholder="0,00">`;
    const input = span.querySelector('input');
    const sinalEl = span.querySelector('.inpValorSinal');
    let sinalNegativo = negativo;

    input.addEventListener('input', () => {
        const cursorNoFim = input.selectionEnd == input.value.length;
        input.value = formataMascaraDinheiro(input.value);
        if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
    });
    // clique no sinal (+/−) alterna, sem submeter nem perder o foco do input
    sinalEl.onclick = ev => {
        ev.stopImmediatePropagation();
        sinalNegativo = !sinalNegativo;
        sinalEl.textContent = sinalNegativo ? '−' : '+';
        input.focus();
    };

    let concluido = false;
    async function confirma() {
        if (concluido) return;
        concluido = true;
        const novoValor = valorMascaraParaNumero(input.value.trim() || '0') * (sinalNegativo ? -1 : 1);
        if (novoValor == r.v) { desenhar(); return; }   // nada mudou, so' redesenha (sai do modo edicao)
        input.disabled = true;
        try {
            if (!r._sim) await atualizarLancamento(r.id, { valor: novoValor });
            r.valor = novoValor;
            r.v = novoValor;
            desenhar();
        } catch (err) {
            alert('Falhou ao atualizar: ' + err.message);
            desenhar();
        }
    }
    function cancela() { concluido = true; desenhar(); }

    input.addEventListener('keydown', ev => {
        if (ev.key == 'Enter') { ev.preventDefault(); confirma(); }
        else if (ev.key == 'Escape') { ev.preventDefault(); cancela(); }
    });
    input.addEventListener('blur', () => confirma());

    input.focus();
    input.select();
});

// Recalcula em qual ciclo um lancamento cai, com a MESMA regra da carga inicial
// (carregarDados) — mudar a data pode jogar a linha pra outro periodo, ou pro Backlog
// quando a data e' apagada / cai fora de todos os periodos cadastrados.
function reclassificaPeriodo(r) {
    const idx = !r.data ? null
        : r.cred ? periodoDaFatura(r.fatura || r.fatura_id)
            : periodoDoDebito(dataISO(r.data));
    r.periodoIdx = idx != null && idx >= 0 && idx < Estado.ciclos.length ? idx : null;
}

// clique na Data troca o <span> por um <input type=date>. O banco ja guarda 'YYYY-MM-DD',
// que e' exatamente o formato do value/atributo desse input — nao ha conversao nenhuma no
// meio (a tela e' que mostra DD/MM/AAAA, via dataBR). Enter ou escolher no calendario
// confirma; Escape cancela. Mesmo esquema do toggle Pago e do Valor: stopImmediatePropagation
// pra nao disparar a selecao da linha por baixo.
el('out').addEventListener('click', e => {
    const span = e.target.closest('[data-tog-data]');
    if (!span) return;
    if (isMobile()) return;
    if (span.classList.contains('editando')) { e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();

    const id = span.dataset.togData;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const original = dataISO(r.data);
    span.classList.add('editando');
    span.innerHTML = `<input type=date class=inpData value="${original}">`;
    const input = span.querySelector('input');

    let concluido = false;
    async function confirma() {
        if (concluido) return;
        concluido = true;
        const nova = input.value || null;   // apagar a data manda o lancamento pro Backlog
        if ((nova || '') === original) { desenhar(); return; }   // nada mudou, so' sai do modo edicao
        input.disabled = true;
        try {
            if (!r._sim) await atualizarLancamento(r.id, { data: nova });
            r.data = nova;
            reclassificaPeriodo(r);
            desenhar();
        } catch (err) {
            alert('Falhou ao atualizar: ' + err.message);
            desenhar();
        }
    }
    function cancela() { concluido = true; desenhar(); }

    input.addEventListener('keydown', ev => {
        if (ev.key == 'Enter') { ev.preventDefault(); confirma(); }
        else if (ev.key == 'Escape') { ev.preventDefault(); cancela(); }
    });
    input.addEventListener('change', () => confirma());   // escolheu no calendario nativo
    input.addEventListener('blur', () => confirma());
    // clique dentro do proprio input (inclusive no icone do calendario) nao pode vazar
    // pro listener de selecao de linha, que esta no mesmo #out
    input.addEventListener('click', ev => ev.stopImmediatePropagation());

    input.focus();
});

el('out').addEventListener('click', e => {
    // badges interativos têm seus próprios handlers; nunca podem também selecionar a linha.
    if (e.target.closest('[data-tog-reserva-emergencia]')) return;
    const linha = e.target.closest('tr[data-sid]');
    if (!linha || !linha.dataset.sid || e.target.closest('th')) return;
    if (isMobile()) return;
    if (e.shiftKey) { const s = getSelection(); if (s) s.removeAllRanges(); }   // limpa a selecao de texto nativa do shift-click
    if (e.shiftKey && !isMobile() && Estado.ultimaClicada) {
        const idTabela = Object.keys(Estado.linhasVisiveis)
            .find(id => (Estado.linhasVisiveis[id] || []).some(r => chaveSelecao(r) === linha.dataset.sid));
        if (idTabela) { selecionarIntervalo(idTabela, linha.dataset.sid); return; }
    }
    alternarSelecao(linha.dataset.sid);
});
el('selacao').onclick = () => { Estado.selecionados.clear(); desenhar(); };
el('ciclo').addEventListener('change', () => { atualizaBarraSelecao(); });
// Intervalo invertido (De > Ate) nao faz sentido: o campo que o usuario ACABOU de
// escolher "ganha", empurrando o outro pra igualar ele — mexeu no De e ficou maior que
// o Ate? o Ate sobe junto. Mexeu no Ate e ficou menor que o De? o De desce junto.
el('compDe').addEventListener('change', () => {
    if (el('compDe').value && el('compDe').value != '-1' && el('compAte').value
        && +el('compDe').value > +el('compAte').value) {
        el('compAte').value = el('compDe').value;
    }
    atualizaBarraSelecao();
});
el('compAte').addEventListener('change', () => {
    if (el('compDe').value && el('compDe').value != '-1' && el('compAte').value
        && +el('compAte').value < +el('compDe').value) {
        el('compDe').value = el('compAte').value;
    }
    atualizaBarraSelecao();
});

el('btGrafico').onclick = () => abrirGraficoGastos(+el('btGrafico').dataset.idx);
el('btMetaReservaEmergencia').onclick = () => abrirMetaReservaEmergencia(+el('btMetaReservaEmergencia').dataset.idx);
el('btEvolucao').onclick = () => abrirGraficoEvolucao(+el('compDe').value, +el('compAte').value);

// volta pro ciclo atual (De=Ate=hoje) — mesmo padrao com que a pagina abre. Fica
// desabilitado quando hoje nao cai em periodo nenhum.
function atualizaBtCicloHoje() {
    el('cicloHoje').disabled = Estado.idxHoje < 0;
}
el('cicloHoje').onclick = () => {
    if (Estado.idxHoje < 0) return;
    el('compDe').value = Estado.idxHoje;
    el('compAte').value = Estado.idxHoje;
    desenhar();
};

// ‹ / › navegam pro periodo anterior/seguinte. Anda pelas OPCOES reais do combo #compDe
// (com Backlog como primeira opção), não por
// indice aritmetico — assim respeita os mesmos limites de navegacao sem duplicar a logica.
// Com De==Ate (1 ciclo so', "modo blocos") sempre foi assim: anda 1 a 1, igualando os
// dois (entra direto no modo blocos daquele ciclo). Comparando um INTERVALO (De != Ate,
// ex: 2 meses de distancia) o clique desliza a janela inteira mantendo a MESMA distancia
// entre De e Ate — um passo pra CADA lado (De e Ate andam +1/-1 juntos), nunca pulando
// pelo tamanho do intervalo inteiro, senao "Jan-Mar" viraria "Mai-Jul" de uma vez em vez
// de "Fev-Abr". Backlog nunca entra nesse modo — De='-1' sempre deixa Ate desabilitado
// (ver desenhar()), entao so' chega aqui com os dois periodos reais.
function navegaCiclo(direcao) {
    const opcoes = [...el('compDe').options].map(o => o.value).filter(v => v !== '');
    const deAtual = el('compDe').value || '', ateAtual = el('compAte').value || '';
    const posDeAtual = opcoes.indexOf(deAtual);
    const comparandoIntervalo = deAtual && deAtual !== '-1' && ateAtual && deAtual !== ateAtual;

    if (comparandoIntervalo) {
        const posAteAtual = opcoes.indexOf(ateAtual);
        const novaPosDe = posDeAtual + direcao, novaPosAte = posAteAtual + direcao;
        if (novaPosDe < 1 || novaPosAte >= opcoes.length) return;   // nunca pousa em Backlog nem passa do fim
        el('compDe').value = opcoes[novaPosDe];
        el('compAte').value = opcoes[novaPosAte];
        desenhar();
        return;
    }

    const novaPos = posDeAtual < 0 ? (direcao > 0 ? 0 : -1) : posDeAtual + direcao;
    if (novaPos < 0 || novaPos >= opcoes.length) return;
    const novoValor = opcoes[novaPos];
    el('compDe').value = novoValor;
    el('compAte').value = novoValor == '-1' ? el('compAte').value : novoValor;
    desenhar();
}
function atualizaBtsNavCiclo() {
    const opcoes = [...el('compDe').options].map(o => o.value).filter(v => v !== '');
    const deAtual = el('compDe').value || '', ateAtual = el('compAte').value || '';
    const posDe = opcoes.indexOf(deAtual);
    const comparandoIntervalo = deAtual && deAtual !== '-1' && ateAtual && deAtual !== ateAtual;

    if (comparandoIntervalo) {
        const posAte = opcoes.indexOf(ateAtual);
        el('cicloAnterior').disabled = posDe <= 1;
        el('cicloProximo').disabled = posAte < 0 || posAte >= opcoes.length - 1;
    } else {
        el('cicloAnterior').disabled = posDe <= 0;
        el('cicloProximo').disabled = posDe < 0 || posDe >= opcoes.length - 1;
    }
}
el('cicloAnterior').onclick = () => navegaCiclo(-1);
el('cicloProximo').onclick = () => navegaCiclo(1);

// qualquer select/checkbox da barra de ferramentas redesenha a tela ao mudar
// >>> LOG TEMP: try/catch aqui so pra diagnostico — sem isso, um erro no desenhar()
// disparado por um filtro (fora do try do load()) sumia sem aparecer em lugar nenhum.
// compDe/compAte moraram em .tool ate virarem parte do slot #navComparar (em .head,
// pra nao dar "tremor" de layout ao trocar Ciclo/Comparar) — por isso entram na
// selecao aqui tambem, senao o "onchange" generico da toolbar nunca os alcança.
document.querySelectorAll('.tool select,.tool input,#navComparar select').forEach(e => e.onchange = () => {
    try { desenhar(); } catch (err) { console.error('[diag] erro ao redesenhar apos mudar filtro:', err); }
});

// ===================================================================
// LIMPAR FILTROS — devolve a tela pro estado em que ela abre
// ===================================================================
// Valor padrao de cada select da toolbar: e' a 1a <option> de cada um no index.html, que e'
// tambem o que o navegador seleciona sozinho na 1a carga. desenhar() ainda pode sobrescrever
// alguns deles conforme o modo (ex: Ativo vira "Ambos" no Backlog, Origem volta pra "Tudo"
// no modo blocos) — o padrao aqui e' so' o ponto de partida, igual na abertura da pagina.
