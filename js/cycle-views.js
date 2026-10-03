// Visões Ciclo e Comparar.

function vCiclo() {
    const i = +el('ciclo').value;

    if (i < 0) {   // Backlog: lancamentos sem data ou fora de qualquer periodo
        const linhas = filtrarLancamentos().filter(r => r.periodoIdx == null);
        return renderBloco('Backlog', linhas.reduce((s, r) => s + r.v, 0), 'Sem data ou fora dos ciclos', linhas, 'bk', true);
    }

    const periodo = Estado.ciclos[i];
    if (!periodo) return '<p class=empty>Sem ciclos</p>';

    const debitos = filtrarLancamentos().filter(r => r.periodoIdx == i && !r.cred);
    const visiveis = filtrarLancamentos();
    const creditosDaFatura = visiveis.filter(r => r.periodoIdx == i && r.cred);

    // Ha um unico cartao detalhado. A fatura da Isabella e' um lancamento comum no bloco
    // Debito, com valor atualizado manualmente, e nunca vira uma linha sintetica aqui.
    // O vencimento vem da fatura escolhida manualmente em cada credito.
    const vencimentoDaFatura = vencimentoDoCiclo(i);
    const abatido = alocacaoAntecipacoes(visiveis);
    const montaLinhaFatura = () => {
        const total = creditosDaFatura.reduce((s, r) => s + r.v, 0);
        if (!total) return null;   // sem compras no cartao, sem linha
        const liquido = total + (abatido[i] || 0);
        // fatura quitada nao aparece: nao ha mais nada pra sair da conta
        if (Math.abs(liquido) < 0.005) return null;
        const venc = vencimentoDaFatura;
        const sid = `fat:${i}`;
        Estado.valorFaturaPorCiclo[sid] = liquido;
        return {
            data: venc || periodo.fat, nome: 'Fatura do cartão', categ: 'Fatura',
            freq: '', id: -3, v: liquido, valor: liquido, _fat: 1, _sid: sid,
        };
    };
    const linhasFatura = [montaLinhaFatura()].filter(Boolean);

    const simples = modoSimples();
    // saldo que veio do ciclo anterior — positivo ou negativo, entra como uma linha
    // normal no comeco do bloco
    const anterior = saldoDoCiclo(i - 1);
    const linhaAnterior = Math.abs(anterior) > 0.005 && Estado.ciclos[i - 1] &&
        dataISO(Estado.ciclos[i - 1].fat) >= SALDO_DESDE
        ? [{
            data: periodo.ini, nome: 'Saldo do mês anterior', categ: 'Saldo',
            freq: '', id: -1, _sid: `sal:${i}`, v: anterior, valor: anterior, _sal: 1
        }]
        : [];

    const debitosComFatura = [...linhaAnterior, ...debitos, ...linhasFatura];

    const movimentosDoSaldo = [
        ...linhaAnterior,
        ...debitos,
        ...linhasFatura
    ];


    const totalCiclo = movimentosDoSaldo.reduce((s, r) => s + r.v, 0);

    // Resgate necessario / Aporte sugerido: mesma regra usada em todo o app (ajusteInvestimento),
    // aplicada sobre o totalCiclo — que e' o mesmo valor que totalBaseDoCiclo(i) calcularia.
    // Limitado ao que sobra de guardado NO MOMENTO do ajuste: o guardado do ciclo anterior
    // menos os investimentos reais ja lancados dentro deste ciclo (ver
    // guardadoDisponivelNoCiclo) — nao da' pra resgatar dinheiro que um resgate real do
    // proprio mes ja levou.
    const ajuste = dataISO(periodo.fat) >= SALDO_DESDE
        ? ajusteInvestimento(totalCiclo,
            guardadoDisponivelNoCiclo(i, filtrarLancamentos(), guardadoAte(i - 1)))
        : null;

    // _sid namespaced ("res:"/"sug:") pra nao colidir com o id de um lancamento real (ou
    // simulado) que por acaso seja -1/-2/-5 — sem isso, chaveSelecao() (que prefere _sid
    // mas cai pra String(id) quando falta) tratava as duas linhas como a MESMA chave,
    // e o Map de selecao (1 valor por chave) descartava uma delas silenciosamente: a
    // soma da barra flutuante ficava menor que o total do titulo, sem nenhum erro visivel.
    const linhaResgate = ajuste && ajuste.tipo == 'resgate'
        ? [{
            data: dataISO(periodo.fat),
            nome: ajuste.nome,
            categ: ajuste.categ,
            freq: '',
            id: -2,
            _sid: `res:${i}`,
            v: ajuste.v,
            valor: ajuste.v,
            _res: 1
        }]
        : [];

    const linhaSugestao = ajuste && ajuste.tipo == 'aporte'
        ? [{
            data: dataISO(periodo.fat),
            nome: ajuste.nome,
            categ: ajuste.categ,
            freq: '',
            id: -5,
            _sid: `sug:${i}`,
            v: ajuste.v,
            valor: ajuste.v,
            _sug: ajuste.v
        }]
        : [];

    const linhasDebito = [
        ...debitosComFatura,
        ...linhaResgate,
        ...linhaSugestao
    ];
    const guardado = guardadoAte(i);
    const totalDebito = linhasDebito.reduce((s, r) => s + r.v, 0);
    // O título passa a dizer o que já ocorreu hoje, separado da previsão do ciclo. O
    // recorte de hoje não acompanha filtros da tela: ele é um retrato financeiro real.
    // Um ciclo que ainda não começou só tem futuro; repetir o saldo atual nele seria falso.
    // O passado é histórico: mantém apenas o retrato de Hoje, sem uma projeção futura redundante.
    const debitoHoje = resumoDebitoPagoAte(Estado.lancamentos);
    const cicloDebitoFuturo = dataISO(periodo.ini) > hojeISO();
    const cicloDebitoPassado = dataISO(periodo.fat) < hojeISO();
    const classeSaldoHoje = corValor(debitoHoje.saldo);
    const classeSaldoFuturo = corSoma(totalDebito);
    // Todo título reserva o mesmo espaço para alerta. Quando há risco, o ícone fica à direita
    // de Débito/Crédito; quando não há, continua invisível sem deslocar os resumos ao lado.
    const alertaTitulo = (classe, visivel, titulo, rotulo) => visivel
        ? `<span class="alertaTitulo ${classe}" role=img title="${titulo}" aria-label="${rotulo}">⚠</span>`
        : `<span class="alertaTitulo ${classe} vazio" aria-hidden=true>⚠</span>`;
    const debitoTemSaldoVermelho = classeSaldoHoje == 'vm' || classeSaldoFuturo == 'vm';
    const alertaTituloDebito = alertaTitulo('alertaSaldo', debitoTemSaldoVermelho,
        'Saldo negativo', 'Saldo negativo após usar o guardado');
    const linhaHojeDebito = cicloDebitoFuturo ? '' :
        `<span class=resumoLinha><span class=resumoRotulo>Hoje</span><span class=resumoDados>` +
        `<span>Saldo <b class="${classeSaldoHoje}">${brl(debitoHoje.saldo)}</b></span>` +
        `<span>Guardado <b class="${corValor(debitoHoje.guardado)}">${brl(debitoHoje.guardado)}</b></span></span></span>`;
    const linhaFuturoDebito = cicloDebitoPassado ? '' :
        `<span class=resumoLinha><span class=resumoRotulo>Futuro</span><span class=resumoDados>` +
        `<span>Saldo <b class="${classeSaldoFuturo}">${brl(totalDebito)}</b></span>` +
        `<span>Guardado <b class="${corValor(guardado)}">${brl(guardado)}</b></span></span></span>`;
    const resumoDebito = `<span class=resumoTitulo>` + linhaHojeDebito + linhaFuturoDebito + `</span>`;

    const blocoDebito = renderBloco(
        `Débito${alertaTituloDebito}`, totalDebito,
        `${periodo.ini ? dataBR(periodo.ini) : 'inicio'} a ${dataBR(periodo.fat)}`,
        linhasDebito, 'db', true, '', resumoDebito
    );

    // O modo simples no mobile não mostra o bloco Crédito. A fatura líquida
    // continua incorporada no Débito, então esconder a prévia não perde o impacto no saldo.
    if (modoSimples()) return blocoDebito;

    // Só o desktop completo monta a prévia de Crédito do ciclo seguinte e seu total líquido.
    const idxCreditoExibido = i + 1;
    const creditosExibidos = creditosExibidosNoCiclo(visiveis, i);
    const totalCreditoExibido = totalCreditoExibidoAposAntecipacoes(
        creditosExibidos, abatido[idxCreditoExibido] || 0
    );
    // No histórico, pagamento/antecipação não pode apagar a memória da fatura. O título
    // compacto mostra as compras brutas daquela fatura, inclusive as já quitadas.
    const totalCreditoHistorico = creditosExibidos.reduce((soma, r) => soma + r.v, 0);
    const totalTituloCredito = cicloDebitoPassado ? totalCreditoHistorico : totalCreditoExibido;
    // A linha "Hoje" considera só compras confirmadas até a data local atual e
    // antecipações já registradas. A prévia de Crédito do ciclo atual continua tendo
    // "Hoje", ainda que sua fatura vença no ciclo seguinte; só a navegação para um ciclo
    // futuro remove essa linha, junto com o retrato atual do Débito.
    const pagosAteHoje = lancamentosPagosAte(Estado.lancamentos);
    const abatidoAteHoje = alocacaoAntecipacoes(pagosAteHoje);
    const totalCreditoHoje = totalCreditoExibidoAposAntecipacoes(
        creditosExibidosNoCiclo(pagosAteHoje, i), abatidoAteHoje[idxCreditoExibido] || 0
    );
    // Limite não segue os filtros da tela: é o retrato do único cartão real. A mesma
    // alocação de antecipações define quando cada compra confirmada deixa de ocupá-lo.
    // A garantia Nubank usa aportes/resgates REAIS de todos os status. Ela não pode seguir
    // o filtro Pago da tela nem contar Aporte sugerido, pois ambos fariam o limite variar
    // sem que o dinheiro efetivamente aplicado na Nubank tivesse mudado.
    const abatidoDoCartao = alocacaoAntecipacoes(Estado.lancamentos);
    const guardadoGarantido = guardadoGarantidoAte(Estado.lancamentos, i);
    const limiteTotal = limiteCartaoTotal(guardadoGarantido);
    const limiteLivreHoje = limiteCartaoLivre(Estado.lancamentos, abatidoDoCartao, guardadoGarantido);
    // A prévia é a fatura do próximo ciclo. O Livre futuro parte do teto menos essa fatura
    // inteira (paga e aberta), como se a anterior já tivesse sido quitada; compras
    // confirmadas de faturas posteriores também continuam ocupando o cartão.
    const limiteLivreFuturo = limiteCartaoLivreFuturo(
        Estado.lancamentos, abatidoDoCartao, guardadoGarantido, idxCreditoExibido, totalCreditoExibido
    );
    const garantia = Math.max(0, guardadoGarantido);
    // O teto total é somente leitura no "de"; o campo discreto dentro dos parênteses edita
    // a parte aprovada/contratada sem misturá-la com a garantia variável do ciclo.
    const limiteContratadoEditavel = LIMITE_CARTAO.toLocaleString('pt-BR', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    // O teto e a garantia são contexto do cartão. Só o Livre muda: Hoje retrata o uso real,
    // enquanto Futuro já considera quitada a fatura anterior à prévia.
    // O aviso compara cada gasto líquido com o teto utilizável, não com o limite livre.
    // Uma única marca no título indica excesso em Hoje ou Futuro sem deslocar a tabela.
    // O limite é um alerta operacional, então ciclos encerrados não exibem aviso retrospectivo.
    const creditoAcimaLimite = !cicloDebitoPassado &&
        (Math.abs(totalCreditoHoje) > limiteTotal || limiteLivreFuturo < -TOLERANCIA_FINANCEIRA);
    const alertaTituloCredito = alertaTitulo('alertaLimite', creditoAcimaLimite,
        'Acima do limite', 'Gasto acima do limite');
    const resumoLimiteCartao = limiteLivre => `<span class=limiteCartao>Livre <b class="${corValor(limiteLivre)}">${brl(limiteLivre)}</b> de ${brl(limiteTotal)} (` +
        `<span class=limiteCartaoBase>R$ <input class=limiteCartaoEditavel data-limite-cartao ` +
        `value="${limiteContratadoEditavel}" placeholder="0,00" inputmode=decimal title="Editar limite aprovado" aria-label="Limite aprovado"> Aprovado</span>` +
        `${garantia ? `<span class=limiteGarantido> + ${brl(garantia)} Garantido</span>` : ''})</span>`;

    // Crédito histórico volta ao cabeçalho compacto: só o total da fatura, sem Hoje/Futuro.
    const linhaHojeCredito = cicloDebitoFuturo || cicloDebitoPassado ? '' :
        `<span class=resumoLinha><span class=resumoRotulo>Hoje</span><span class=resumoDados>` +
        `<b class="${corSoma(totalCreditoHoje)}">${brl(Math.abs(totalCreditoHoje))}</b>` +
        resumoLimiteCartao(limiteLivreHoje) + `</span></span>`;
    const linhaFuturoCredito = cicloDebitoPassado ? '' :
        `<span class=resumoLinha><span class=resumoRotulo>Futuro</span><span class=resumoDados>` +
        `<b class="${corSoma(totalCreditoExibido)}">${brl(Math.abs(totalCreditoExibido))}</b>` +
        resumoLimiteCartao(limiteLivreFuturo) + `</span></span>`;
    const resumoCredito = cicloDebitoPassado ? '' :
        `<span class=resumoTitulo>` + linhaHojeCredito + linhaFuturoCredito + `</span>`;

    const blocoCredito = renderBloco(
        `Crédito${alertaTituloCredito}`, totalTituloCredito,
        tituloFaturaDoCiclo(idxCreditoExibido),
        creditosExibidos, 'cr', true, '', resumoCredito,
        // Só o título compacto do Crédito histórico não usa ponto entre nome e total.
        cicloDebitoPassado ? ' ' : undefined
    );

    return blocoDebito + blocoCredito;
}

// Visão "Comparar": uma matriz [categoria/nome/etc × periodo], com totais por linha e coluna.
// Reserva é uma marca para a meta própria. Na comparação ela nunca vira uma categoria: se
// coexistir com outra, preserva-se apenas a classificação útil; se vier sozinha, a linha sai.
function categoriaDaComparacao(categ) {
    const categorias = categoriasSeparadas(categ);
    if (!categorias.length) return textoOuTraco(categ);
    return categorias.filter(categoria => !ehCategoria(categoria, 'Reserva')).join(', ');
}

// Estas categorias não são comparáveis: Rendimento é entrada, Reembolso compensa uma despesa,
// Teste é técnica e as demais são recortes que o mantenedor não quer analisar nesta matriz.
// "Presemte" é tolerado como grafia já usada de Presente; ambas ficam fora da comparação.
const CATEGORIAS_EXCLUIDAS_DA_COMPARACAO = [
    'Rendimento', 'Reembolso', 'Teste', 'Alimentação', 'Transporte', 'Besteira',
    'Presente', 'Presemte', 'Saldo',
];

function ehLinhaExcluidaDaComparacao(r) {
    const categoriaEspecial = categoriasSeparadas(r.categ)
        .some(categoria => CATEGORIAS_EXCLUIDAS_DA_COMPARACAO
            .some(excluida => ehCategoria(categoria, excluida)));
    return categoriaEspecial || ehAntecipacaoFatura(r.categ) || ehAntecipacaoFatura(r.nome);
}

function filtrarLinhasDaComparacao(reais, sinteticas) {
    // A regra vale depois da união para alcançar também Saldo do mês anterior e qualquer
    // outra linha sintética que venha a receber uma categoria excluída no futuro.
    return [...reais, ...sinteticas].filter(r => !ehLinhaExcluidaDaComparacao(r));
}

function chaveDaRecorrencia(r) {
    const nome = semAcento(r.nome).trim();
    const categoria = semAcento(categoriaDaComparacao(r.categ)).trim();
    return `${nome}|${categoria}`;
}

function gruposComRecorrenciaDuplicadaEntreMeses(linhas) {
    // Uma recorrência continua sendo a mesma quando seu valor muda. Nome e categoria
    // identificam o compromisso; o valor é apenas o montante daquela ocorrência.
    const mesesPorGrupo = {};
    linhas.filter(ehLinhaReal).forEach(r => {
        const grupo = chaveDaRecorrencia(r);
        (mesesPorGrupo[grupo] = mesesPorGrupo[grupo] || new Set()).add(dataISO(r.data).slice(0, 7));
    });
    return new Set(Object.entries(mesesPorGrupo)
        .filter(([, meses]) => meses.size >= 2)
        .map(([grupo]) => grupo));
}

function temRecorrenciaDuplicadaEntreMeses(linhas) {
    return gruposComRecorrenciaDuplicadaEntreMeses(linhas).size > 0;
}

function todasRecorrenciasDaMudancaSaoExplicadas(linhasDaMudanca, fontesDuplicadas) {
    const gruposDaMudanca = new Set(linhasDaMudanca.filter(ehLinhaReal).map(chaveDaRecorrencia));
    if (!gruposDaMudanca.size) return false;
    const gruposExplicados = new Set(fontesDuplicadas
        .flatMap(linhas => [...gruposComRecorrenciaDuplicadaEntreMeses(linhas)]));
    return [...gruposDaMudanca].every(grupo => gruposExplicados.has(grupo));
}

// Classifica uma categoria pelos dois ciclos comparados e pelos dois seguintes. Sem os dois
// ciclos futuros não há confirmação suficiente para afirmar começo, fim ou ocorrência única.
function estadoDaComparacaoPorCiclos(presencas, idxPrimeiro, idxSegundo, totalCiclos) {
    if (idxSegundo + 2 >= totalCiclos) return { acabou: false, comecou: false, unico: false };
    const tem = idx => presencas.has(idx);
    const haviaAntes = tem(idxPrimeiro), temAgora = tem(idxSegundo);
    // "Acabou" só vale para algo que vinha recorrendo. Sem presença no ciclo anterior ao
    // primeiro comparado, uma ocorrência isolada não pode virar falsamente um encerramento.
    const vinhaRecorrendo = idxPrimeiro > 0 && tem(idxPrimeiro - 1);
    const continuaDoisCiclos = tem(idxSegundo + 1) && tem(idxSegundo + 2);
    const someDoisCiclos = !tem(idxSegundo + 1) && !tem(idxSegundo + 2);
    return {
        acabou: haviaAntes && vinhaRecorrendo && !temAgora && someDoisCiclos,
        comecou: !haviaAntes && temAgora && continuaDoisCiclos,
        unico: !haviaAntes && temAgora && someDoisCiclos,
    };
}

function vComp() {
    // reseta ANTES de qualquer return antecipado — senao um valor de uma chamada
    // anterior fica "preso" (ex: filtro "Somente Diferentes" continua aparecendo mesmo
    // depois de trocar De/Ate pra um intervalo que nao tem mais 2 periodos)
    Estado._comparacao2Periodos = false;

    const coluna = 'categ';   // Comparar sempre agrupa por Categoria — sem filtro "Agrupar por" na toolbar
    // so mostra a matriz depois que o usuario escolhe De E Ate — nunca vem preenchida sozinha
    const deTexto = el('compDe').value, ateTexto = el('compAte').value;
    if (!deTexto || !ateTexto || deTexto == '-1') return '<p class=empty>Escolha o período (De / Até) para comparar.</p>';

    const de = +deTexto, ate = +ateTexto;
    const dentroDoIntervalo = i => i >= de && i <= ate;

    // rede de seguranca: desenhar() ja decide "modo blocos" (De==Ate) e chama vCiclo()
    // direto nesse caso, entao vComp() normalmente nunca chega aqui com de==ate — mas se
    // for chamada de outro lugar no futuro, continua se comportando corretamente.
    if (de == ate) {
        el('ciclo').value = de;
        return vCiclo();
    }

    const visiveis = filtrarLancamentos();
    // Comparar é uma visão de categorias, não de transferências de caixa: Antecipação Fatura
    // não entra e tampouco precisa de uma linha sintética de abatimento para compensá-la.
    // O rótulo Antecipação Fatura é transferência por regra de negócio, inclusive se algum
    // cadastro legado estiver marcado como crédito. Comparar nunca o trata como gasto.
    const reais = visiveis.filter(r => r.periodoIdx != null);

    // Saldo anterior e ajuste de investimento ainda são as linhas sintéticas financeiras do
    // ciclo; não há abatimento de fatura nesta visão, pois ele não representa categoria real.
    const sinteticas = [];
    Estado.ciclos.forEach((per, idx) => {
        if (!dentroDoIntervalo(idx)) return;
        const anterior = saldoDoCiclo(idx - 1);
        if (Math.abs(anterior) > 0.005 && Estado.ciclos[idx - 1] && dataISO(Estado.ciclos[idx - 1].fat) >= SALDO_DESDE) {
            sinteticas.push({
                nome: 'Saldo do mês anterior', categ: 'Saldo', freq: '', pago: null,
                id: -1, _sid: `sal:${idx}`, data: per.ini, cred: false,
                v: anterior, valor: anterior, periodoIdx: idx,
            });
        }
        const ajuste = ajusteDoCiclo(idx);
        if (!ajuste) return;
        sinteticas.push({
            nome: ajuste.nome, categ: ajuste.categ, freq: '', pago: null,
            id: ajuste.tipo == 'resgate' ? -2 : -5,
            _sid: `${ajuste.tipo == 'resgate' ? 'res' : 'sug'}:${idx}`,
            data: dataISO(per.fat), cred: false, v: ajuste.v, valor: ajuste.v, periodoIdx: idx,
        });
    });

    const linhas = filtrarLinhasDaComparacao(reais, sinteticas);
    if (!linhas.length) return '<p class=empty>Vazio</p>';

    // A confirmação de começo/fim olha os lançamentos dos ciclos futuros já cadastrados,
    // inclusive fora do intervalo visível. Reserva é removida pelo mesmo normalizador da matriz.
    const presencasPorChave = new Map();
    linhas.filter(r => r.periodoIdx != null).forEach(r => {
        const chave = categoriaDaComparacao(r[coluna]);
        if (!chave) return;
        const presencas = presencasPorChave.get(chave) || new Set();
        presencas.add(r.periodoIdx);
        presencasPorChave.set(chave, presencas);
    });

    const periodosUsados = [...new Set(linhas.map(r => r.periodoIdx))].filter(dentroDoIntervalo).sort((a, b) => a - b);
    const matriz = {};
    // guarda tambem os LANCAMENTOS individuais de cada celula (categoria x periodo), pra
    // abrir o detalhamento (nome + valor) ao clicar. Chave = "<categoria>||<periodoIdx>".
    const linhasDaCelula = {};
    linhas.filter(r => dentroDoIntervalo(r.periodoIdx)).forEach(r => {
        const chave = categoriaDaComparacao(r[coluna]);
        if (!chave) return; // linha classificada apenas como Reserva não participa do Comparar.
        (matriz[chave] = matriz[chave] || {})[r.periodoIdx] = (matriz[chave][r.periodoIdx] || 0) + r.v;
        const chaveCelula = chave + '||' + r.periodoIdx;
        (linhasDaCelula[chaveCelula] = linhasDaCelula[chaveCelula] || []).push(r);
    });
    const totalDaChave = chave => Object.values(matriz[chave]).reduce((a, b) => a + b, 0);
    Estado._detalheComparar = { matriz: linhasDaCelula, coluna };   // lido por abreDetalheCelComparar()

    const oc = Estado.ordComp;
    const seta = k => oc.k == k ? (oc.d == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';

    // Com EXATAMENTE 2 períodos no intervalo, as três colunas extras confirmam mudanças
    // olhando os dois ciclos seguintes: Acabou, Começou e Único. A opção Diferentes usa as
    // mesmas confirmações; fora dessa comparação, a toolbar permanece oculta.
    const comparacao2Periodos = periodosUsados.length == 2;
    Estado._comparacao2Periodos = comparacao2Periodos;
    const [idxPrimeiro, idxSegundo] = periodosUsados;
    const estadoDaChave = chave => comparacao2Periodos
        ? estadoDaComparacaoPorCiclos(presencasPorChave.get(chave) || new Set(), idxPrimeiro, idxSegundo, Estado.ciclos.length)
        : { acabou: false, comecou: false, unico: false };
    const nomeMes1 = comparacao2Periodos ? nomeMesPeriodo(Estado.ciclos[idxPrimeiro].fat) : '';
    const nomeMes2 = comparacao2Periodos ? nomeMesPeriodo(Estado.ciclos[idxSegundo].fat) : '';

    // Dentro de uma categoria x periodo, agrupa os lancamentos REAIS por nome+categoria e
    // avisa quando algum grupo se repete (2+) com datas de MESES DIFERENTES entre si —
    // sintoma de um lancamento recorrente que caiu 2x dentro do
    // MESMO ciclo porque a janela entre dois Faturamentos PJ atravessou a virada do mes,
    // e nao uma despesa que realmente comecou/parou de existir. Sem esse
    // aviso, uma mudança confirmada fazia parecer que a categoria sumiu ou surgiu quando na
    // verdade ela so' foi contada 2x nesse aqui (e ficou de fora, sem repetir, no outro).
    // Ignora linhas sinteticas (Saldo/Fatura/Investimento) — a checagem e' so' pra
    // lancamento de verdade.
    const linhasReaisDaChaveNoCiclo = (chave, periodoIdx) => linhas.filter(r => r.periodoIdx == periodoIdx
        && categoriaDaComparacao(r[coluna]) == chave && ehLinhaReal(r));
    const temRecorrenciaDuplicadaNoCiclo = (chave, periodoIdx) => temRecorrenciaDuplicadaEntreMeses(
        linhasReaisDaChaveNoCiclo(chave, periodoIdx),
    );
    // Uma categoria inteira só deixa de ser "Diferente" se TODOS os nomes que sustentam a
    // mudança forem explicados por duplicidade. Uma recorrência de Ammi, por exemplo, não pode
    // esconder os demais nomes que realmente fizeram Isabella começar naquele ciclo.
    const mudancaInteiramenteExplicadaPorDuplicidade = (chave, estado) => {
        const cicloMarcado = estado.acabou ? idxPrimeiro : idxSegundo;
        const linhasDaMudanca = linhasReaisDaChaveNoCiclo(chave, cicloMarcado);
        const fontesDuplicadas = [linhasDaMudanca];
        if ((estado.comecou || estado.unico) && idxPrimeiro > 0) {
            fontesDuplicadas.push(linhasReaisDaChaveNoCiclo(chave, idxPrimeiro - 1));
        }
        return todasRecorrenciasDaMudancaSaoExplicadas(linhasDaMudanca, fontesDuplicadas);
    };
    // HTML do asterisco de aviso, colado no "✓" de difOk/difNovo, so' quando o lado que
    // TEM o lancamento (chave, periodoIdx) apresenta essa duplicata de mes diferente.
    const avisoRecorrenciaDuplicada = (chave, periodoIdx) => temRecorrenciaDuplicadaNoCiclo(chave, periodoIdx)
        ? '<span class=avisoDup title="Possível recorrência duplicada">*</span>'
        : '';

    // Filtro "Linhas": Todas (N) mostra tudo. Diferentes (D) mostra apenas categorias com
    // começo, fim ou ocorrência única confirmados e descarta as que carregam aviso de recorrência
    // duplicada: nesse caso a janela do ciclo cortou o mês ao meio, não houve diferença real.
    const modoLinhas = el('somenteDif').value;
    const somenteDif = comparacao2Periodos && modoLinhas == 'D';

    // ao LIGAR o filtro (de Todas para Diferentes), passa a
    // ordenar pela coluna "Começou" (a coisa nova recorrente fica em cima); ao DESLIGAR,
    // volta a ordenar pela coluna principal (nome/categ/o que estiver em "Agrupar por").
    // So dispara na TRANSICAO (nao a cada redesenho, senao o usuario nunca conseguiria
    // reordenar manualmente por outra coluna).
    if (somenteDif && !Estado._somenteDifAnterior) oc.k = 'comecou', oc.d = 2;
    else if (!somenteDif && Estado._somenteDifAnterior) oc.k = 'chave', oc.d = 1;
    Estado._somenteDifAnterior = somenteDif;

    const chavesFiltradas = Object.keys(matriz).filter(chave => {
        if (!somenteDif) return true;
        const estado = estadoDaChave(chave);
        if (!estado.acabou && !estado.comecou && !estado.unico) return false;
        if (mudancaInteiramenteExplicadaPorDuplicidade(chave, estado)) return false;
        return true;
    });

    // com so' 1 periodo no intervalo a coluna Total seria identica a unica coluna de
    // periodo — redundante, entao some nesse caso
    const mostraColTotal = periodosUsados.length > 1;

    const cabecalho = `<tr><th class=c1 onclick="sortComp('chave')">${nomeColuna(coluna)}${seta('chave')}</th>` +
        (comparacao2Periodos
            ? `<th class="n colDif" title="Não aparece em ${nomeMes2} nem nos dois ciclos seguintes" onclick="sortComp('acabou')">Acabou em ${nomeMes1}${seta('acabou')}</th>` +
            `<th class="n colDif" title="Aparece em ${nomeMes2} e continua nos dois ciclos seguintes" onclick="sortComp('comecou')">Começou em ${nomeMes2}${seta('comecou')}</th>` +
            `<th class="n colDif" title="Aparece somente em ${nomeMes2} e some nos dois ciclos seguintes" onclick="sortComp('unico')">Único em ${nomeMes2}${seta('unico')}</th>`
            : '') +
        periodosUsados.map(i => `<th class=n onclick="sortComp('${i}')">${nomePeriodo(Estado.ciclos[i])}${seta(String(i))}</th>`).join('') +
        (mostraColTotal ? `<th class=n onclick="sortComp('total')">Total${seta('total')}</th>` : '') +
        `</thead>`;

    // ordena pela coluna escolhida: 'chave' é alfabética; os estados são booleanos;
    // 'total' e as colunas de período são numéricos
    // (celula vazia conta como zero)
    const valorDaLinha = chave =>
        oc.k == 'total' ? totalDaChave(chave)
            : oc.k == 'acabou' ? (estadoDaChave(chave).acabou ? 1 : 0)
                : oc.k == 'comecou' ? (estadoDaChave(chave).comecou ? 1 : 0)
                    : oc.k == 'unico' ? (estadoDaChave(chave).unico ? 1 : 0)
                    : (matriz[chave][+oc.k] || 0);
    // cada linha de categoria vira selecionavel igual as tabelas do Ciclo (clique marca,
    // shift-click marca intervalo, soma na barra flutuante) — o valor usado e' o Total da
    // categoria no intervalo (totalDaChave), nao uma celula especifica. `_sid` prefixado
    // com "cp:" pra nao colidir com as chaves sinteticas de fatura ("fat:") do Ciclo.
    const linhasSelecionaveis = [];
    const corpo = chavesFiltradas.sort((a, b) => {
        const cmp = oc.k == 'chave'
            ? String(a).localeCompare(String(b), 'pt')
            : valorDaLinha(a) - valorDaLinha(b);
        return oc.d == 1 ? cmp : -cmp;
    }).map(chave => {
        const sid = 'cp:' + chave;
        linhasSelecionaveis.push({ _sid: sid, nome: chave, v: totalDaChave(chave) });
        const marcada = Estado.selecionados.has(sid);
        const estado = estadoDaChave(chave);
        return `<tr class="${marcada ? 'on' : ''} pick" data-sid="${escapeHtml(sid)}"><td class=c1>${chave}</td>` +
            (comparacao2Periodos
                ? `<td class="n colDif">${estado.acabou ? `<span class=difOk>✓</span>${avisoRecorrenciaDuplicada(chave, idxPrimeiro)}` : ''}</td>` +
                `<td class="n colDif">${estado.comecou ? `<span class=difNovo>✓</span>${avisoRecorrenciaDuplicada(chave, idxSegundo)}` : ''}</td>` +
                `<td class="n colDif">${estado.unico ? `<span class=difUnico>✓</span>${avisoRecorrenciaDuplicada(chave, idxSegundo)}` : ''}</td>`
                : '') +
            periodosUsados.map(i => {
                if (matriz[chave][i] == null) return '<td class=n>·</td>';
                const v = matriz[chave][i];
                const chaveJs = escapeHtml(chave).replace(/'/g, '&#39;');
                return `<td class="n ${corSoma(v)} celClicavel" onclick="event.stopPropagation();abrirDetalheCelComparar('${chaveJs}',${i})">${brl(v)}</td>`;
            }).join('') +
            (mostraColTotal ? celSoma(totalDaChave(chave)) : '');
    }).join('');
    Estado.linhasVisiveis['cp'] = linhasSelecionaveis;

    const linhasNoIntervalo = linhas.filter(r => dentroDoIntervalo(r.periodoIdx));
    // Total é a soma exata das linhas visíveis no Comparar. Ele não tenta reproduzir o saldo
    // de caixa do ciclo, que inclui antecipações de fatura deliberadamente ausentes daqui.
    const totalDoPeriodo = i => Object.values(matriz).reduce((soma, valores) => soma + (valores[i] || 0), 0);
    const celTotalPeriodo = i => celSoma(totalDoPeriodo(i));
    const totalGeral = chavesFiltradas.reduce((soma, chave) => soma + totalDaChave(chave), 0);
    const linhaTotal = '<tr class=tot><td class=c1>Total</td>' +
        // As três colunas de status não são valores acumuláveis; células explícitas evitam
        // que o navegador as reposicione para o fim da linha Total.
        (comparacao2Periodos ? '<td class="n colDif"></td><td class="n colDif"></td><td class="n colDif"></td>' : '') +
        periodosUsados.map(celTotalPeriodo).join('') +
        (mostraColTotal ? celSoma(totalGeral) : '');

    // subtitulo: quantas linhas a matriz tem (varia com o "Agrupar por" — cada valor
    // distinto da coluna escolhida vira uma linha) e o intervalo de datas do periodo
    // De/Ate. A contagem de "N registros" (quantos lancamentos foram somados) ja vem
    // de graca da blocoCasca, igual nos blocos Debito/Credito — nao repete aqui.
    const nGrupos = chavesFiltradas.length;
    const nRegistros = linhasNoIntervalo.length;
    const iniPeriodo = Estado.ciclos[periodosUsados[0]];
    const fimPeriodo = Estado.ciclos[periodosUsados.at(-1)];
    const subtitulo =
        `${nGrupos} ${nGrupos == 1 ? nomeColuna(coluna) : nomeColuna(coluna) + 's'}` +
        (iniPeriodo && fimPeriodo ? ` · ${dataBR(iniPeriodo.ini)} a ${dataBR(fimPeriodo.fat)}` : '');

    // titulo no mesmo estilo dos blocos Debito/Credito
    const tituloPeriodo = iniPeriodo && fimPeriodo
        ? `Comparação ${nomePeriodoAbrev(iniPeriodo.fat)} até ${nomePeriodoAbrev(fimPeriodo.fat)}`
        : 'Comparação';

    // MESMA casca (blocoCasca) usada por Debito/Credito/Backlog: titulo, botao de
    // collapse (▾/▸), linha de meta info e o corpo por baixo — pra trocar de visao
    // (Ciclo <-> Comparar) ser impercetivel, os blocos ficam visualmente identicos.
    return blocoCasca(tituloPeriodo, subtitulo, nRegistros, 'cp',
        () => `<div class="wrap wx"><table><thead>${cabecalho}<tbody>${corpo}${linhaTotal}</tbody></table></div>`);
}
