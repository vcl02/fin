// Filtros visuais e gráficos do painel.

const FILTROS_PADRAO = { titular: 'T', fpago: 'B', fativo: 'S', origem: 'A', somenteDif: 'N', fvalor: 'T' };

function limparFiltros() {
    Object.entries(FILTROS_PADRAO).forEach(([id, valor]) => { el(id).value = valor; });
    Estado.filtroTexto = {};      // buscas por coluna (Data/Nome/Valor/Categoria/Frequência)
    Estado.fechados = {};         // blocos recolhidos voltam a abrir
    Estado.selecionados.clear();  // as linhas marcadas somem junto com o recorte que as gerou
    Estado.ordenacaoPorTabela = {};   // volta pra ordenacao padrao (data ascendente)
    Estado.ordComp = { k: 'total', d: 2 };
    excluidasDoGrafico = [];      // categorias excluidas da pizza
    // De/Ate: zerar os dois faz desenhar() repor o ciclo ATUAL nos dois (mesmo caminho da
    // 1a carga). Sem ciclo atual, ficam em "Todos" — que tambem e' como a pagina abriria.
    el('compDe').value = '';
    el('compAte').value = '';
    desenhar();
}
el('btLimparFiltros').onclick = limparFiltros;

// ===================================================================
// VISUALIZAÇÃO: ROBERTA — acerto de contas
// ===================================================================
// Ela adiantou um valor de uma vez (entra POSITIVO na categoria) e a divida vai sendo
// quitada aos poucos com o que sai pra ela (negativo — credito ou debito, tanto faz).
// De proposito olha TODOS os lancamentos da categoria e IGNORA os filtros/ciclo da barra:
// o acerto e' a relacao inteira, nao um recorte dela. Conta so' o que ja e' fato: 'ativo'
// (desativado foi cancelado) e 'pago' — enquanto o pagamento nao aconteceu o dinheiro nao
// saiu, e contar agendado inflaria o progresso do acerto.
const ehCategoria = (categ, procurada) => semAcento(categ).trim() === semAcento(procurada).trim();

function dadosCategoria(categoria) {
    const linhas = Estado.lancamentos.filter(r => r.ativo && r.pago && ehCategoria(r.categ, categoria));
    const entradas = linhas.reduce((s, r) => s + Math.max(r.v, 0), 0);
    const saidas = linhas.reduce((s, r) => s - Math.min(r.v, 0), 0);
    // O percentual visual para em 100%, mas o saldo continua mostrando excesso de saída.
    const pctUsado = entradas ? Math.min(100, saidas / entradas * 100) : 0;
    return { linhas, entradas, saidas, saldo: entradas - saidas, pctUsado, pctRestante: 100 - pctUsado };
}

// Entrada Econ, Evolução Obra e Dívida Estudantil medem execução financeira: o universo é tudo que
// está ativo no recorte (pago + não pago), e a barra compara o valor pago com esse total.
// Usa valor absoluto porque despesas são armazenadas com sinal negativo.
function dadosPagamentoCategoria(op) {
    const campo = op.campo || 'categ';
    const valor = op.valor || op.categoria;
    const linhas = Estado.lancamentos.filter(r =>
        r.ativo && ehCategoria(r[campo], valor) && (!op.somenteNegativos || r.v < 0)
    );
    const total = linhas.reduce((s, r) => s + Math.abs(r.v), 0);
    const pago = linhas.filter(r => r.pago).reduce((s, r) => s + Math.abs(r.v), 0);
    const naoPago = Math.max(0, total - pago);
    const pctPago = total ? Math.min(100, pago / total * 100) : 0;
    return { linhas, total, pago, naoPago, pctPago };
}

const pct1 = n => n.toFixed(1).replace('.', ',') + '%';

function abrirVisCategoria(op) {
    const d = dadosCategoria(op.categoria);
    const encerrado = d.saldo <= 0.005;
    const semBase = d.entradas <= 0.005;
    const pctDestaque = encerrado ? 0 : d.pctRestante;
    el('tituloVisCategoria').textContent = op.titulo;
    el('robertaCorpo').innerHTML = !d.linhas.length
        ? `<p class=meta>Nenhum lançamento pago na categoria “${escapeHtml(op.categoria)}” ainda.</p>`
        : `<div class="robPct ${encerrado ? 'vd' : 'vm'}">${semBase ? '—' : pct1(pctDestaque)}</div>
           <p class=robPctSub>${encerrado ? op.subEncerrado : op.subAberto}</p>
           <div class=robBarra><div class=robFill style="width:${d.pctUsado.toFixed(2)}%"></div></div>
           <div class=robLegenda>
             <span>${semBase ? 'Sem entrada positiva' : `${op.legendaUsado} ${pct1(d.pctUsado)}`}</span>
             <span>${d.linhas.length} lançamento${d.linhas.length > 1 ? 's' : ''}</span>
           </div>
           <table class=robTab><tbody>
             <tr><td>${op.rotuloEntrada}<td class="n vm">${brl(d.entradas)}
             <tr><td>${op.rotuloSaida}<td class="n vd">${brl(d.saidas)}
             <tr class=tot><td>${d.saldo < -0.005 ? op.rotuloExcesso : op.rotuloSaldo}<td class=n>${brl(Math.abs(d.saldo))}
           </tbody></table>`;
    el('modalRoberta').showModal();
}

function abrirVisPagamentoCategoria(op) {
    const d = dadosPagamentoCategoria(op);
    const concluido = d.total > 0 && d.naoPago <= 0.005;
    const valorFiltro = op.valor || op.categoria;
    const rotuloFiltro = op.campo == 'nome' ? 'nome' : 'categoria';
    el('tituloVisCategoria').textContent = op.titulo;
    el('robertaCorpo').innerHTML = !d.linhas.length
        ? `<p class=meta>Nenhum lançamento ativo com ${rotuloFiltro} “${escapeHtml(valorFiltro)}” ainda.</p>`
        : `<div class="robPct ${concluido ? 'vd' : 'vm'}">${pct1(d.pctPago)}</div>
           <p class=robPctSub>do valor total está pago</p>
           <div class=robBarra><div class=robFill style="width:${d.pctPago.toFixed(2)}%"></div></div>
           <div class=robLegenda>
             <span>Pago ${pct1(d.pctPago)}</span>
             <span>${d.linhas.length} lançamento${d.linhas.length > 1 ? 's' : ''}</span>
           </div>
           <table class=robTab><tbody>
             <tr><td>Pago<td class="n vd">${brl(d.pago)}
             <tr><td>Não pago<td class="n vm">${brl(d.naoPago)}
             <tr class=tot><td>Total<td class=n>${brl(d.total)}
           </tbody></table>`;
    el('modalRoberta').showModal();
}

const VIS_CATEGORIAS = {
    Roberta: {
        categoria: 'Roberta', titulo: 'Roberta', subAberto: 'falta pra quitar com ela',
        subEncerrado: 'quitado — nada a pagar', legendaUsado: 'Você já pagou',
        rotuloEntrada: 'Ela te pagou', rotuloSaida: 'Você já pagou',
        rotuloSaldo: 'Falta', rotuloExcesso: 'Pagou a mais',
    },
    EntradaEcon: {
        categoria: 'Entrada Econ', titulo: 'Entrada Econ',
    },
    EvolucaoObra: {
        categoria: 'Evolução Obra', titulo: 'Evolução Obra',
    },
    DividaEstudantil: {
        categoria: 'Dívida Estudantil', titulo: 'Dívida Estudantil',
    },
    RenegociacaoPj: {
        categoria: 'Renegociação PJ', titulo: 'Renegociação PJ',
    },
    Emprestimo: {
        categoria: 'Empréstimo', titulo: 'Empréstimo',
    },
    Pos: {
        campo: 'nome', valor: 'Pós', titulo: 'Pós',
    },
    RenegociacaoNu: {
        campo: 'nome', valor: 'Renegociação Nu', titulo: 'Renegociação Nu',
    },
    Iphone: {
        campo: 'nome', valor: 'Iphone', titulo: 'Iphone', somenteNegativos: true,
    },
    SeguroResidencial: {
        campo: 'nome', valor: 'Seguro Residencial', titulo: 'Seguro Residencial',
    },
    Senac: {
        campo: 'nome', valor: 'Senac', titulo: 'Senac',
    },
};

el('btRoberta').onclick = () => abrirVisCategoria(VIS_CATEGORIAS.Roberta);
el('btEntradaEcon').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.EntradaEcon);
el('btEvolucaoObra').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.EvolucaoObra);
el('btDividaEstudantil').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.DividaEstudantil);
el('btRenegociacaoPj').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.RenegociacaoPj);
el('btEmprestimo').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Emprestimo);
el('btPos').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Pos);
el('btRenegociacaoNu').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.RenegociacaoNu);
el('btIphone').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Iphone);
el('btSeguroResidencial').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.SeguroResidencial);
el('btSenac').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Senac);
el('fechaRoberta').onclick = () => el('modalRoberta').close();
el('modalRoberta').addEventListener('click', e => { if (e.target == el('modalRoberta')) el('modalRoberta').close(); });

// ===================================================================
// GRÁFICO DE GASTOS DO CICLO (pizza)
// ===================================================================
// Regra: total = soma de TUDO positivo no ciclo (renda, sem selecao manual).
// Fatias = cada categoria com saldo negativo no ciclo (gasto), com a linha
// sintetica "Fatura do cartão" contando como a categoria "Fatura do cartão", e o
// Resgate necessario / Aporte sugerido do ciclo contando como renda / categoria
// "Investimento", igual um resgate/aporte real contaria.
// O usuario pode excluir categorias especificas da pizza via multi-select.
let graficoChart = null;
let excluidasDoGrafico = [];
let metaReservaEmergenciaChart = null;
const MESES_META_RESERVA_EMERGENCIA = 9;

// Projeta cada nome marcado nos nove ciclos a partir do selecionado. Uma ocorrência
// cadastrada no ciclo substitui a estimativa daquele nome; sem ocorrência, continua
// valendo o último valor conhecido. Assim uma previsão crescente entra mês a mês.
function dadosMetaReservaEmergencia(linhas, idxPeriodo, guardado) {
    const porCiclo = new Map();
    linhas.forEach(r => {
        if (!(r.v < 0) || r._transferencia || r.reserva !== true || r.periodoIdx == null) return;
        const gastos = porCiclo.get(r.periodoIdx) || new Map();
        const nome = String(r.nome || '').trim();
        gastos.set(nome, (gastos.get(nome) || 0) + -r.v);
        porCiclo.set(r.periodoIdx, gastos);
    });

    const ultimoValorPorNome = new Map();
    const totaisPorCiclo = [];
    let mesesComEstimativa = 0;
    for (let i = idxPeriodo; i < idxPeriodo + MESES_META_RESERVA_EMERGENCIA; i++) {
        const cadastrados = porCiclo.get(i) || new Map();
        cadastrados.forEach((valor, nome) => ultimoValorPorNome.set(nome, valor));
        if ([...ultimoValorPorNome.keys()].some(nome => !cadastrados.has(nome))) mesesComEstimativa++;
        totaisPorCiclo.push([...ultimoValorPorNome.values()].reduce((s, v) => s + v, 0));
    }
    const gastoMensal = totaisPorCiclo[0];
    const meta = totaisPorCiclo.reduce((s, v) => s + v, 0);
    const totalGuardado = Math.max(0, guardado || 0);
    return {
        gastoMensal, meta, guardado: totalGuardado, mesesComEstimativa, totaisPorCiclo,
        guardadoNaMeta: Math.min(meta, totalGuardado),
        restante: Math.max(0, meta - totalGuardado),
        excedente: Math.max(0, totalGuardado - meta),
        percentual: meta ? Math.min(100, totalGuardado / meta * 100) : 0,
    };
}

function dadosMetaReservaEmergenciaCiclo(idxPeriodo) {
    const periodo = Estado.ciclos[idxPeriodo];
    const gastos = filtrarLancamentos()
        .filter(r => r.periodoIdx != null && r.periodoIdx >= idxPeriodo && r.periodoIdx < idxPeriodo + MESES_META_RESERVA_EMERGENCIA)
        .map(r => ({ ...r, _transferencia: ehTransferenciaFatura(r) }));
    return { periodo, ...dadosMetaReservaEmergencia(gastos, idxPeriodo, guardadoAte(idxPeriodo)) };
}

function dadosDoGraficoCiclo(idxPeriodo) {
    const periodo = Estado.ciclos[idxPeriodo];
    const visiveis = Estado.lancamentos.filter(r =>
        passaFiltroTriEstado('fativo', r.ativo) && passaFiltroTriEstado('fpago', r.pago)
    );
    const doPeriodo = visiveis.filter(r =>
        r.periodoIdx == idxPeriodo && !r.cred && !ehTransferenciaFatura(r));


    // A fatia BRUTA do unico cartao mostra onde o dinheiro foi gasto, e antecipar
    // e' so a forma de pagar — quem paga a fatura inteira nao gastou menos.
    const creditosDoPeriodo = Estado.lancamentos.filter(r => r.periodoIdx == idxPeriodo && r.cred);
    const totalFatura = creditosDoPeriodo.reduce((s, r) => s + r.v, 0);
    const ajuste = ajusteDoCicloContaUnica(idxPeriodo);
    const linhas = [
        ...doPeriodo,
        totalFatura ? { categ: 'Fatura do cartão', v: totalFatura } : null,
        ajuste ? { categ: ajuste.categ, v: ajuste.v } : null,
    ].filter(Boolean);

    const renda = linhas.filter(r => r.v > 0).reduce((s, r) => s + r.v, 0);
    const porCategoria = {};
    linhas.filter(r => r.v < 0).forEach(r => {
        const cat = textoOuTraco(r.categ);
        porCategoria[cat] = (porCategoria[cat] || 0) + (-r.v);
    });
    return { periodo, renda, porCategoria };
}

// clique numa celula da matriz Comparar (categoria x periodo): abre o detalhamento dos
// lancamentos individuais (nome + valor) que somam aquele total. Estado._detalheComparar.
// matriz e' preenchido em vComp() a cada redesenho; Estado._detalheAtual guarda as linhas
// e a ordenacao ativa do modal aberto, pra sortDetalheCel() poder reordenar sem reabrir.
window.abrirDetalheCelComparar = (categoria, periodoIdx) => {
    const info = Estado._detalheComparar;
    if (!info) return;
    const linhas = info.matriz[categoria + '||' + periodoIdx] || [];

    Estado._detalheAtual = { categoria, periodoIdx, linhas, ord: { k: 'data', d: 2 } };   // padrao: mais recente primeiro
    renderizaDetalheCel();
    el('modalDetalheCel').showModal();
};

// redesenha a mini-tabela do modal de detalhamento com a ordenacao atual de Estado._detalheAtual.ord
function renderizaDetalheCel() {
    const info = Estado._detalheAtual;
    if (!info) return;
    const { categoria, periodoIdx, linhas, ord } = info;
    const periodo = Estado.ciclos[periodoIdx];

    el('tituloDetalheCel').textContent = categoria;
    el('subDetalheCel').textContent =
        `${nomePeriodo(periodo)} · ${linhas.length} ${linhas.length == 1 ? 'lançamento' : 'lançamentos'}`;

    const seta = k => ord.k == k ? (ord.d == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';
    const valorOrd = { data: r => timestamp(r.data), nome: r => semAcento(r.nome ?? ''), valor: r => r.v };
    const ordenadas = [...linhas].sort((a, b) => {
        const A = valorOrd[ord.k](a), B = valorOrd[ord.k](b);
        const cmp = typeof A == 'string' ? A.localeCompare(B, 'pt') : A - B;
        return ord.d == 1 ? cmp : -cmp;
    });

    const total = linhas.reduce((s, r) => s + r.v, 0);
    el('corpoDetalheCel').innerHTML =
        `<table><thead><tr>` +
        `<th onclick="sortDetalheCel('data')">Data${seta('data')}` +
        `<th onclick="sortDetalheCel('nome')">Nome${seta('nome')}` +
        `<th class=n onclick="sortDetalheCel('valor')">Valor${seta('valor')}` +
        `</thead><tbody>` +
        ordenadas.map(r => `<tr><td>${r.data ? dataBR(r.data) : '—'}<td>${celNome(r)}${celValor(r.v)}`).join('') +
        `<tr class=tot><td colspan=2>Total${celSoma(total)}</tbody></table>`;
}

// clique no header da mini-tabela do modal: mesma logica de sortComp (1o clique ordena
// desc — mais relevante primeiro — clique de novo alterna asc/desc)
window.sortDetalheCel = k => {
    const ord = Estado._detalheAtual.ord;
    if (ord.k != k) { ord.k = k; ord.d = 2; }
    else ord.d = ord.d == 1 ? 2 : 1;
    renderizaDetalheCel();
};

el('fechaDetalheCel').onclick = () => el('modalDetalheCel').close();
el('modalDetalheCel').addEventListener('click', e => { if (e.target == el('modalDetalheCel')) el('modalDetalheCel').close(); });

window.abrirGraficoGastos = idxPeriodo => {
    const { periodo, renda, porCategoria } = dadosDoGraficoCiclo(idxPeriodo);
    const todasCategorias = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
    excluidasDoGrafico = excluidasDoGrafico.filter(c => todasCategorias.includes(c));

    el('graficoSubtitulo').textContent = `${nomePeriodo(periodo)} · Renda do ciclo: ${brl(renda)}`;
    montaExcluirCatDrop(todasCategorias);
    desenhaGraficoPizza(idxPeriodo);
    el('modalGrafico').showModal();
};

window.abrirMetaReservaEmergencia = idxPeriodo => {
    if (!Estado.ciclos[idxPeriodo]) return;
    const d = dadosMetaReservaEmergenciaCiclo(idxPeriodo);
    el('metaReservaEmergenciaSubtitulo').textContent =
        `${nomePeriodo(d.periodo)} · despesas previstas para ${MESES_META_RESERVA_EMERGENCIA} ciclos`;
    desenhaMetaReservaEmergencia(idxPeriodo);
    el('modalMetaReservaEmergencia').showModal();
};

function montaExcluirCatDrop(categorias) {
    el('excluirCatDrop').innerHTML = categorias.map(c =>
        `<label><input type=checkbox value="${c}" ${excluidasDoGrafico.includes(c) ? '' : 'checked'} onchange="toggleCategoriaGrafico('${c}',this.checked)">${c}</label>`
    ).join('');
    atualizaBotaoExcluirCat();
}
function atualizaBotaoExcluirCat() {
    const n = excluidasDoGrafico.length;
    el('excluirCatBtn').textContent = n == 0 ? 'Nenhuma excluída' : `${n} excluída${n > 1 ? 's' : ''}`;
}
// checkbox MARCADO = categoria incluida na pizza; desmarcar exclui
window.toggleCategoriaGrafico = (categoria, incluida) => {
    excluidasDoGrafico = incluida
        ? excluidasDoGrafico.filter(c => c !== categoria)
        : [...excluidasDoGrafico, categoria];
    atualizaBotaoExcluirCat();
    const idxAtual = el('modalGrafico').dataset.periodoIdx;
    desenhaGraficoPizza(+idxAtual);
};
el('excluirCatBtn').onclick = () => el('excluirCatDrop').classList.toggle('open');
document.addEventListener('click', e => {
    if (!e.target.closest('#excluirCatWrap')) el('excluirCatDrop').classList.remove('open');
});

const CORES_PIZZA = [
    '#8B84F5',
    '#35B982',
    '#E06B3C',
    '#D95C86',
    '#4B9BE8',
    '#F0A83A',
    '#79AE3A',
    '#92989D',
    '#C04A4A',
    '#A84F73'
];

function desenhaGraficoPizza(idxPeriodo) {
    el('modalGrafico').dataset.periodoIdx = idxPeriodo;
    const { renda, porCategoria } = dadosDoGraficoCiclo(idxPeriodo);
    const categorias = Object.keys(porCategoria)
        .filter(c => !excluidasDoGrafico.includes(c))
        .sort((a, b) => porCategoria[b] - porCategoria[a]);
    const valores = categorias.map(c => porCategoria[c]);

    el('graficoVazio').hidden = categorias.length > 0;
    el('canvasGraficoGastos').style.display = categorias.length ? 'block' : 'none';
    if (!categorias.length) { if (graficoChart) { graficoChart.destroy(); graficoChart = null } return; }

    const cores = categorias.map((_, i) => CORES_PIZZA[i % CORES_PIZZA.length]);
    if (graficoChart) graficoChart.destroy();
    graficoChart = new Chart(el('canvasGraficoGastos'), {
        type: 'pie',
        data: { labels: categorias, datasets: [{ data: valores, backgroundColor: cores, borderColor: '#FFF', borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 14 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = valores.reduce((a, b) => a + b, 0);
                            const pctRenda = renda ? (ctx.parsed / renda * 100).toFixed(1) : '0.0';
                            const pctGasto = total ? (ctx.parsed / total * 100).toFixed(1) : '0.0';
                            return `${ctx.label}: ${brl(ctx.parsed)} · ${pctGasto}% dos gastos · ${pctRenda}% da renda`;
                        }
                    }
                }
            }
        }
    });
}

function desenhaMetaReservaEmergencia(idxPeriodo) {
    const d = dadosMetaReservaEmergenciaCiclo(idxPeriodo);
    const temMeta = d.meta > 0.005;
    el('metaReservaEmergenciaVazio').hidden = temMeta;
    el('canvasMetaReservaEmergencia').style.display = temMeta ? 'block' : 'none';
    el('metaReservaEmergenciaResumo').innerHTML = !temMeta ? '' :
        `<div class="metaReservaResumo">
          <div class="metaReservaPct ${d.percentual >= 100 ? 'vd' : 'vm'}">${pct1(d.percentual)}</div>
          <p class=meta>da meta já guardada</p>
          <table><tbody>
            <tr><td>Gasto neste ciclo<td class=n>${brl(d.gastoMensal)}
            <tr><td>Meta dos próximos ${MESES_META_RESERVA_EMERGENCIA} ciclos<td class=n>${brl(d.meta)}
            <tr><td>Guardado até este ciclo<td class="n vd">${brl(d.guardado)}
            <tr class=tot><td>${d.excedente ? 'Acima da meta' : 'Falta guardar'}<td class="n ${d.excedente ? 'vd' : 'vm'}">${brl(d.excedente || d.restante)}
          </tbody></table>
          ${d.mesesComEstimativa ? `<p class=meta>${d.mesesComEstimativa} de ${MESES_META_RESERVA_EMERGENCIA} ciclos incluem valores estimados pelo último lançamento de cada gasto.</p>` : ''}
        </div>`;
    if (!temMeta) {
        if (metaReservaEmergenciaChart) { metaReservaEmergenciaChart.destroy(); metaReservaEmergenciaChart = null; }
        return;
    }
    if (metaReservaEmergenciaChart) metaReservaEmergenciaChart.destroy();
    metaReservaEmergenciaChart = new Chart(el('canvasMetaReservaEmergencia'), {
        type: 'doughnut',
        data: {
            labels: ['Guardado', 'Falta guardar'],
            datasets: [{ data: [d.guardadoNaMeta, d.restante], backgroundColor: ['#35B982', '#363C42'], borderColor: '#FFF', borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${brl(ctx.parsed)}` } }
            }
        }
    });
}

el('fechaGrafico').onclick = () => el('modalGrafico').close();
el('modalGrafico').addEventListener('click', e => {
    if (e.target == el('modalGrafico')) el('modalGrafico').close();
});

// clique no badge "Reserva emergência" alterna a classificação sem selecionar a linha.
// Em linhas reais, a mudança vale para todas as ocorrências com o mesmo nome exato.
// Linhas simuladas continuam exclusivamente em memória.
el('out').addEventListener('click', async e => {
    const badge = e.target.closest('[data-tog-reserva-emergencia]');
    if (!badge) return;
    if (isMobile()) return;
    e.stopImmediatePropagation();

    const id = badge.dataset.togReservaEmergencia;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const nome = String(r.nome || '');
    const novaReservaEmergencia = !r.reserva;
    badge.classList.toggle('tagReservaEmergencia', novaReservaEmergencia);
    badge.classList.toggle('tagSemReservaEmergencia', !novaReservaEmergencia);
    badge.textContent = novaReservaEmergencia ? 'Sim' : 'Não';
    badge.style.opacity = .5;

    try {
        if (Estado.simulando || r._sim) {
            Estado.lancamentos
                .filter(x => x.nome === nome)
                .forEach(x => { x.reserva = novaReservaEmergencia; });
        } else {
            const esperados = Estado.lancamentos
                .filter(x => ehLinhaReal(x) && x.nome === nome)
                .map(x => String(x.id));
            const atualizados = await atualizarReservaEmergenciaPorNome(nome, novaReservaEmergencia);
            const idsAtualizados = new Set(atualizados.map(x => String(x.id)));
            const faltantes = esperados.filter(idEsperado => !idsAtualizados.has(idEsperado));
            if (faltantes.length) {
                await load();
                throw Error(`atualização parcial: ${faltantes.length} lançamento(s) com o nome "${nome}" não retornaram do banco`);
            }
            const porId = new Map(atualizados.map(x => [String(x.id), x]));
            Estado.lancamentos.forEach(x => {
                const atualizado = porId.get(String(x.id));
                if (atualizado) x.reserva = !!atualizado.reserva;
            });
        }
        desenhar();
    } catch (err) {
        badge.style.opacity = '';
        mostrarToast('Falhou ao atualizar', err.message);
        desenhar();
    }
});
el('fechaMetaReservaEmergencia').onclick = () => el('modalMetaReservaEmergencia').close();
el('modalMetaReservaEmergencia').addEventListener('click', e => {
    if (e.target == el('modalMetaReservaEmergencia')) el('modalMetaReservaEmergencia').close();
});

// ===================================================================
// GRÁFICO DE EVOLUÇÃO (Comparar) — ganho x gasto x aportado x resgatado, mês a mês
// ===================================================================
// Regra por período:
//   Ganho     = soma dos positivos, exceto categoria Investimento (nao inclui Resgate
//               real nem o Resgate necessario hipotetico)
//   Aportado  = soma dos negativos DA categoria Investimento (invertido pra positivo),
//               incluindo o Aporte sugerido do ciclo (se houver)
//   Resgatado = soma dos positivos DA categoria Investimento, incluindo o Resgate
//               necessario hipotetico do ciclo (se houver)
//   Gasto     = soma dos negativos, exceto categoria Investimento (nao inclui Aporte
//               real nem o Aporte sugerido hipotetico)
let graficoEvolucaoChart = null;

function dadosEvolucao(de, ate) {
    const periodosUsados = [];
    for (let i = de; i <= ate; i++) if (Estado.ciclos[i]) periodosUsados.push(i);

    const { base, abat } = baseEAbatFiltrados();

    const porPeriodo = periodosUsados.map(i => {
        // compras no CREDITO nao entram uma a uma: o que sai da conta no mes e' a fatura
        // LIQUIDA (bruto + antecipacao ja paga), a mesma linha sintetica que o bloco Debito
        // da visao Ciclo mostra. Somar o bruto de cada compra inflava o Gasto pela
        // antecipacao — ex: R$5.008,42 em compras que viram R$3.026,14 a pagar.
        //
        // A ANTECIPACAO de fatura entra normalmente (regime de caixa): ela saiu da conta
        // NESTE mes, entao conta como gasto aqui — e a fatura que ela quita ja vem abatida
        // do mesmo valor (alocacaoAntecipacoes), no mes seguinte. Sem dupla contagem: o
        // desembolso aparece uma vez, no mes em que aconteceu. Excluir a antecipacao (como
        // a pizza de categorias faz, onde ela e' transferencia e nao gasto) sumia com o
        // dinheiro do grafico — nem no mes do pagamento nem no da fatura.
        const linhas = base.filter(r => r.periodoIdx == i && !r.cred);
        const investimento = linhas.filter(r => r.inv);
        const resto = linhas.filter(r => !r.inv);

        // guarda as linhas que compoem cada barra (nao so o total) pra o clique na barra
        // poder abrir o detalhamento item a item — sem isso, uma divergencia entre o
        // grafico e a soma manual do bloco Debito nao tem como ser conferida na tela.
        const linhasDe = {
            Ganho: resto.filter(r => r.v > 0),
            Gasto: resto.filter(r => r.v < 0),
            Resgatado: investimento.filter(r => r.v > 0),
            Aportado: investimento.filter(r => r.v < 0),
        };

        // uma linha da unica fatura detalhada, liquida de antecipacao (mesmo criterio de
        // vCiclo: fatura ja quitada — liquido ~0 — nao vira linha nenhuma)
        const brutoFatura = base
            .filter(r => r.cred && r.periodoIdx == i)
            .reduce((s, r) => s + r.v, 0);
        if (brutoFatura) {
            const liquido = brutoFatura + (abat[i] || 0);
            if (Math.abs(liquido) >= 0.005) {
                linhasDe[liquido < 0 ? 'Gasto' : 'Ganho'].push({
                    data: vencimentoDoCiclo(i), nome: 'Fatura do cartão', categ: 'Fatura', v: liquido,
                });
            }
        }

        // o Resgate necessario / Aporte sugerido do ciclo entra como uma linha sintetica na
        // barra correspondente, do mesmo jeito que aparece no bloco Debito da visao Ciclo
        const ajuste = ajusteDoCiclo(i);
        if (ajuste) {
            linhasDe[ajuste.tipo == 'resgate' ? 'Resgatado' : 'Aportado'].push({
                data: dataISO(Estado.ciclos[i].fat), nome: ajuste.nome, categ: ajuste.categ, v: ajuste.v,
            });
        }

        const soma = k => linhasDe[k].reduce((s, r) => s + Math.abs(r.v), 0);
        return {
            nome: nomePeriodo(Estado.ciclos[i]), periodoIdx: i, linhasDe,
            ganho: soma('Ganho'), gasto: soma('Gasto'),
            aportado: soma('Aportado'), resgatado: soma('Resgatado'),
        };
    });
    return porPeriodo;
}

window.abrirGraficoEvolucao = (de, ate) => {
    const dados = dadosEvolucao(de, ate);
    desenhaGraficoEvolucao(dados);
    el('modalComparativo').showModal();
};

function desenhaGraficoEvolucao(dados) {
    if (graficoEvolucaoChart) graficoEvolucaoChart.destroy();
    graficoEvolucaoChart = new Chart(el('canvasEvolucao'), {
        type: 'bar',
        data: {
            labels: dados.map(d => d.nome),
            // duas colunas por mes, cada uma empilhando duas barras:
            //   entrada = Ganho (verde) + Resgatado (azul) em cima  -> tudo que entrou na conta
            //   saida   = Gasto (vermelho) + Aportado (laranja) em cima -> tudo que saiu
            // com as duas na mesma altura, o mes fechou equalizado — da' pra ver de relance.
            datasets: [
                { label: 'Ganho', data: dados.map(d => d.ganho), backgroundColor: '#35B982', stack: 'entrada' },
                { label: 'Resgatado', data: dados.map(d => d.resgatado), backgroundColor: '#4C9BE8', stack: 'entrada' },
                { label: 'Gasto', data: dados.map(d => d.gasto), backgroundColor: '#E95F59', stack: 'saida' },
                { label: 'Aportado', data: dados.map(d => d.aportado), backgroundColor: '#F0A83A', stack: 'saida' },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const renda = dados[ctx.dataIndex].ganho;
                            const valor = ctx.parsed.y;
                            // % da renda: so faz sentido pra Gasto e Aportado (Ganho e' a propria renda, sempre 100%)
                            if (ctx.dataset.label == 'Ganho') return `Ganho: ${brl(valor)}`;
                            const pct = renda ? (valor / renda * 100).toFixed(1) : '—';
                            return `${ctx.dataset.label}: ${brl(valor)} · ${pct}% da renda`;
                        }
                    }
                },
            },
            // `stacked` nos dois eixos e' o que faz o `stack` dos datasets valer: sem isso o
            // Chart.js ignora os grupos e desenha as 4 barras lado a lado.
            scales: {
                x: { stacked: true },
                y: { stacked: true, ticks: { callback: v => brl(v) } },
            },
            // clique numa barra abre o detalhamento item a item daquela barra (mesmo modal
            // do clique numa celula da matriz Comparar), pra dar pra conferir de onde vem
            // cada total — e bater com a soma manual do bloco Debito quando divergirem.
            onClick: (_evt, elementos) => {
                if (!elementos.length) return;
                const { datasetIndex, index } = elementos[0];
                const rotulo = graficoEvolucaoChart.data.datasets[datasetIndex].label;
                abrirDetalheBarraEvolucao(dados[index], rotulo);
            },
        },
    });
    el('canvasEvolucao').style.cursor = 'pointer';
}

// detalhamento de uma barra do grafico de evolucao: reaproveita o modal (e a tabela
// ordenavel) do detalhamento de celula da matriz Comparar.
function abrirDetalheBarraEvolucao(dadoDoPeriodo, rotulo) {
    Estado._detalheAtual = {
        categoria: rotulo,
        periodoIdx: dadoDoPeriodo.periodoIdx,
        linhas: dadoDoPeriodo.linhasDe[rotulo] || [],
        ord: { k: 'valor', d: 2 },   // maior primeiro: e' o que ajuda a achar a divergencia
    };
    renderizaDetalheCel();
    el('modalDetalheCel').showModal();
}

el('fechaComparativo').onclick = () => el('modalComparativo').close();
el('modalComparativo').addEventListener('click', e => {
    if (e.target == el('modalComparativo')) el('modalComparativo').close();
});

// ===================================================================
// NOVO LANÇAMENTO (modal de insercao) — otimizado pra cadastro rapido:
// foco automatico, navegacao por Enter, busca de categoria por nome
// parecido, categorias ordenadas por uso recente, modal fica aberto
// apos salvar (pronto pro proximo).
// ===================================================================
