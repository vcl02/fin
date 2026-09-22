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
            freq: '', id: -3, v: liquido, valor: liquido, isa: false, _fat: 1, _sid: sid,
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
    // ciclo equalizado (saldo zero): "R$ 0,00" em destaque verde de sucesso. Usa a mesma
    // tolerancia de ponto flutuante do resto do app (0.005) em vez de igualdade estrita,
    // senao um resto de arredondamento tipo 0.0000000001 escapava do "== 0" mas ainda
    // formatava como "R$ 0,00" na tela. Saldo negativo continua normal. Com algo guardado,
    // o enfoque vira o valor guardado (e' o que importa agora) — o guardado ja fala por si,
    // sem repetir o "R$ 0,00".
    const temGuardado = Math.abs(guardado) > 0.005;
    // guardado pode ser NEGATIVO (resgatou mais do que aportou historicamente) — a cor
    // tem que seguir o sinal de verdade (corValor), nunca fixa em verde, senao um
    // patrimonio negativo aparece com destaque de sucesso por engano.
    const extraDebito = Math.abs(totalDebito) < 0.005
        ? (temGuardado
            ? `<b class="${corValor(guardado)}">${brl(guardado)}</b>`
            : `<b class=vd>${brl(0)}</b>`)
        : (temGuardado ? `<span class="bruto ${corValor(guardado)}">${brl(guardado)}</span>` : '');

    const blocoDebito = renderBloco(
        'Débito', totalDebito,
        `${periodo.ini ? dataBR(periodo.ini) : 'inicio'} a ${dataBR(periodo.fat)}`,
        linhasDebito, 'db', true, extraDebito
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

    const blocoCredito = renderBloco(
        'Crédito', totalCreditoExibido,
        tituloFaturaDoCiclo(idxCreditoExibido),
        creditosExibidos, 'cr', true
    );

    return blocoDebito + blocoCredito;
}

// Visão "Comparar": uma matriz [categoria/nome/etc × periodo], com totais por linha e coluna.
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
    // NAO exclui ehTransferenciaFatura aqui: a antecipacao e' uma TRANSFERENCIA (nao gasto
    // de analise), mas ainda e' uma SAIDA DE CAIXA real, e vCiclo() a inclui normalmente
    // dentro de `debitos` (ver bloco Debito). Excluir esse debito e so' recolocar o
    // abatimento (linha "Antecipação Fatura" abaixo) deixava a soma da matriz R$ igual ao
    // valor antecipado A MAIS do que o Total (saldoDoCiclo) — faltava o lado debito.
    const reais = visiveis.filter(r => r.periodoIdx != null);

    // abatido[idxDoCiclo] = quanto foi antecipado daquela fatura (mesma logica usada em
    // vCiclo() pro bloco Credito) — as compras no credito ja entram em `reais` por
    // categoria, BRUTAS; sem essa injecao a soma da matriz ficaria sem o abatimento.
    const abatido = alocacaoAntecipacoes(visiveis);

    // injeta as MESMAS linhas sinteticas que a visao Ciclo usa, senao o Total da matriz
    // (saldo equalizado, igual ao Ciclo) nao bate com a soma das categorias mostradas:
    // "Saldo do mês anterior" (categoria "Saldo"), Resgate/Aporte (categoria "Investimento")
    // e "Antecipação Fatura" (categoria "Fatura", o abatimento das antecipacoes na fatura
    // que vence naquele periodo — sem essa linha a fatura ficaria bruta, sem abater).
    const sinteticas = [];
    Estado.ciclos.forEach((per, idx) => {
        if (!dentroDoIntervalo(idx)) return;
        const anterior = saldoDoCiclo(idx - 1);
        if (Math.abs(anterior) > 0.005 && Estado.ciclos[idx - 1] && dataISO(Estado.ciclos[idx - 1].fat) >= SALDO_DESDE) {
            sinteticas.push({
                nome: 'Saldo do mês anterior', categ: 'Saldo', freq: '', pago: null,
                id: -1, _sid: `sal:${idx}`, data: per.ini, isa: null, cred: false, ativo: true,
                v: anterior, valor: anterior, periodoIdx: idx,
            });
        }
        // abatimento da fatura: cancela o valor BRUTO da(s) compra(s) de credito que ja
        // entraram em `reais` (por categoria original, ex. "Mercado") — a saida de caixa
        // real da antecipacao ja esta em `reais` tambem, na propria categoria dela.
        const valorAbatido = abatido[idx];
        if (valorAbatido) {
            sinteticas.push({
                nome: 'Abatimento de fatura', categ: 'Abatimento de fatura', freq: '', pago: null,
                id: -6, _sid: `abt:${idx}`, data: dataISO(per.fat), isa: false, cred: false, ativo: true,
                v: valorAbatido, valor: valorAbatido, periodoIdx: idx,
            });
        }
        const ajuste = ajusteDoCiclo(idx);
        if (!ajuste) return;
        sinteticas.push({
            nome: ajuste.nome, categ: ajuste.categ, freq: '', pago: null,
            id: ajuste.tipo == 'resgate' ? -2 : -5,
            _sid: `${ajuste.tipo == 'resgate' ? 'res' : 'sug'}:${idx}`,
            data: dataISO(per.fat), isa: null,
            cred: false, ativo: true, v: ajuste.v, valor: ajuste.v, periodoIdx: idx,
        });
    });

    const linhas = [...reais, ...sinteticas];
    if (!linhas.length) return '<p class=empty>Vazio</p>';

    const periodosUsados = [...new Set(linhas.map(r => r.periodoIdx))].filter(dentroDoIntervalo).sort((a, b) => a - b);
    const matriz = {};
    // guarda tambem os LANCAMENTOS individuais de cada celula (categoria x periodo), pra
    // abrir o detalhamento (nome + valor) ao clicar. Chave = "<categoria>||<periodoIdx>".
    const linhasDaCelula = {};
    linhas.filter(r => dentroDoIntervalo(r.periodoIdx)).forEach(r => {
        const chave = textoOuTraco(r[coluna]);
        (matriz[chave] = matriz[chave] || {})[r.periodoIdx] = (matriz[chave][r.periodoIdx] || 0) + r.v;
        const chaveCelula = chave + '||' + r.periodoIdx;
        (linhasDaCelula[chaveCelula] = linhasDaCelula[chaveCelula] || []).push(r);
    });
    const totalDaChave = chave => Object.values(matriz[chave]).reduce((a, b) => a + b, 0);
    Estado._detalheComparar = { matriz: linhasDaCelula, coluna };   // lido por abreDetalheCelComparar()

    const oc = Estado.ordComp;
    const seta = k => oc.k == k ? (oc.d == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';

    // com EXATAMENTE 2 periodos no intervalo (De/Ate cronologicos), duas colunas extras
    // no inicio marcam o que sumiu do 1o pro 2o mes ("Somente <mes 1>": tinha valor no
    // 1o, celula vazia no 2o) e o que surgiu ("Somente <mes 2>": vazio no 1o, valor no
    // 2o). Exposto em Estado._comparacao2Periodos pra desenhar() saber se mostra o
    // filtro "Somente Diferentes" na toolbar (so' faz sentido com exatamente 2 periodos).
    const comparacao2Periodos = periodosUsados.length == 2;
    Estado._comparacao2Periodos = comparacao2Periodos;
    const [idxPrimeiro, idxSegundo] = periodosUsados;
    const deixouDePagar = chave => comparacao2Periodos && matriz[chave][idxPrimeiro] != null && matriz[chave][idxSegundo] == null;
    const comecouAPagar = chave => comparacao2Periodos && matriz[chave][idxPrimeiro] == null && matriz[chave][idxSegundo] != null;
    const nomeMes1 = comparacao2Periodos ? nomeMesPeriodo(Estado.ciclos[idxPrimeiro].fat) : '';
    const nomeMes2 = comparacao2Periodos ? nomeMesPeriodo(Estado.ciclos[idxSegundo].fat) : '';

    // Dentro de uma categoria x periodo, agrupa os lancamentos REAIS por nome+valor e
    // avisa quando algum grupo se repete (2+) com datas de MESES DIFERENTES entre si —
    // sintoma de um lancamento recorrente (mesmo nome, mesmo valor) que caiu 2x dentro do
    // MESMO ciclo porque a janela entre dois Faturamentos PJ atravessou a virada do mes,
    // e nao uma despesa que realmente comecou/parou de existir. Sem esse
    // aviso, "Somente <mes>" fazia parecer que a categoria sumiu no outro mes quando na
    // verdade ela so' foi contada 2x nesse aqui (e ficou de fora, sem repetir, no outro).
    // Ignora linhas sinteticas (Saldo/Fatura/Investimento) — a checagem e' so' pra
    // lancamento de verdade.
    function temRecorrenciaDuplicadaNoCiclo(chave, periodoIdx) {
        const linhas = (linhasDaCelula[chave + '||' + periodoIdx] || []).filter(ehLinhaReal);
        const mesesPorGrupo = {};
        linhas.forEach(r => {
            const grupo = semAcento(r.nome).trim() + '|' + Math.round((r.v || 0) * 100);
            (mesesPorGrupo[grupo] = mesesPorGrupo[grupo] || new Set()).add(dataISO(r.data).slice(0, 7));
        });
        return Object.values(mesesPorGrupo).some(meses => meses.size >= 2);
    }
    // HTML do asterisco de aviso, colado no "✓" de difOk/difNovo, so' quando o lado que
    // TEM o lancamento (chave, periodoIdx) apresenta essa duplicata de mes diferente.
    const avisoRecorrenciaDuplicada = (chave, periodoIdx) => temRecorrenciaDuplicadaNoCiclo(chave, periodoIdx)
        ? `<span class=avisoDup title="Mesmo nome e valor apareceram 2x dentro deste ciclo, em meses diferentes — pode ser recorrência caindo 2x no mesmo ciclo, não uma mudança real">*</span>`
        : '';

    // Filtro "Linhas": Todas (N) mostra tudo; Diferentes (S) so' as que sumiram/surgiram
    // entre os 2 periodos; Diferentes sem recorrência (I) faz a mesma coisa, mas ainda
    // descarta as que carregam o aviso de recorrência duplicada (avisoRecorrenciaDuplicada
    // acima) — a categoria so' "sumiu"/"surgiu" por causa da janela do ciclo cortando o mes
    // ao meio, entao nao e' uma diferenca de verdade.
    const modoLinhas = el('somenteDif').value;
    const somenteDif = comparacao2Periodos && modoLinhas != 'N';

    // ao LIGAR o filtro (de Todas pra qualquer um dos dois modos de diferenca), passa a
    // ordenar pela coluna "Somente <2º mês>" (a coisa nova fica em cima); ao DESLIGAR,
    // volta a ordenar pela coluna principal (nome/categ/o que estiver em "Agrupar por").
    // So dispara na TRANSICAO (nao a cada redesenho, senao o usuario nunca conseguiria
    // reordenar manualmente por outra coluna).
    if (somenteDif && !Estado._somenteDifAnterior) oc.k = 'dif2', oc.d = 2;
    else if (!somenteDif && Estado._somenteDifAnterior) oc.k = 'chave', oc.d = 1;
    Estado._somenteDifAnterior = somenteDif;

    const chavesFiltradas = Object.keys(matriz).filter(chave => {
        if (!somenteDif) return true;
        const saiu = deixouDePagar(chave), entrou = comecouAPagar(chave);
        if (!saiu && !entrou) return false;
        if (modoLinhas == 'I' && (
            (saiu && temRecorrenciaDuplicadaNoCiclo(chave, idxPrimeiro)) ||
            (entrou && temRecorrenciaDuplicadaNoCiclo(chave, idxSegundo))
        )) return false;
        return true;
    });

    // com so' 1 periodo no intervalo a coluna Total seria identica a unica coluna de
    // periodo — redundante, entao some nesse caso
    const mostraColTotal = periodosUsados.length > 1;

    const cabecalho = `<tr><th class=c1 onclick="sortComp('chave')">${nomeColuna(coluna)}${seta('chave')}` +
        (comparacao2Periodos
            ? `<th class="n colDif" title="Tinha em ${nomeMes1}, não tem mais em ${nomeMes2}" onclick="sortComp('dif1')">Somente ${nomeMes1}${seta('dif1')}</th>` +
            `<th class="n colDif" title="Não tinha em ${nomeMes1}, passou a ter em ${nomeMes2}" onclick="sortComp('dif2')">Somente ${nomeMes2}${seta('dif2')}</th>`
            : '') +
        periodosUsados.map(i => `<th class=n onclick="sortComp('${i}')">${nomePeriodo(Estado.ciclos[i])}${seta(String(i))}`).join('') +
        (mostraColTotal ? `<th class=n onclick="sortComp('total')">Total${seta('total')}` : '') +
        `</thead>`;

    // ordena pela coluna escolhida: 'chave' e' alfabetica; 'dif1'/'dif2' sao booleanos
    // (deixou/comecou a pagar primeiro); 'total' e as colunas de periodo sao numericas
    // (celula vazia conta como zero)
    const valorDaLinha = chave =>
        oc.k == 'total' ? totalDaChave(chave)
            : oc.k == 'dif1' ? (deixouDePagar(chave) ? 1 : 0)
                : oc.k == 'dif2' ? (comecouAPagar(chave) ? 1 : 0)
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
        return `<tr class="${marcada ? 'on' : ''} pick" data-sid="${escapeHtml(sid)}"><td class=c1>${chave}` +
            (comparacao2Periodos
                ? `<td class="n colDif">${deixouDePagar(chave) ? `<span class=difOk>✓</span>${avisoRecorrenciaDuplicada(chave, idxPrimeiro)}` : ''}</td>` +
                `<td class="n colDif">${comecouAPagar(chave) ? `<span class=difNovo>✓</span>${avisoRecorrenciaDuplicada(chave, idxSegundo)}` : ''}</td>`
                : '') +
            periodosUsados.map(i => {
                if (matriz[chave][i] == null) return '<td class=n>·';
                const v = matriz[chave][i];
                const chaveJs = escapeHtml(chave).replace(/'/g, '&#39;');
                return `<td class="n ${corSoma(v)} celClicavel" onclick="event.stopPropagation();abrirDetalheCelComparar('${chaveJs}',${i})">${brl(v)}`;
            }).join('') +
            (mostraColTotal ? celSoma(totalDaChave(chave)) : '');
    }).join('');
    Estado.linhasVisiveis['cp'] = linhasSelecionaveis;

    const linhasNoIntervalo = linhas.filter(r => dentroDoIntervalo(r.periodoIdx));
    // Total = mesmo saldo "equalizado" da visao Ciclo (saldo do mes anterior + movimentos
    // do ciclo + ajuste de Resgate/Aporte). Bate com a soma das categorias mostradas
    // ACIMA porque "Saldo do mês anterior" e "Resgate/Aporte" agora entram como linhas
    // sinteticas na matriz (ver injeção de `sinteticas` mais acima) — sem elas, um mes
    // zerado na visao Ciclo apareceria com saldo bruto (nao-zero) aqui no Comparar.
    // cada celula usa o MESMO tratamento do titulo do bloco Debito na visao Ciclo: mes
    // equalizado (saldo ~0) vira "R$ 0,00" em verde de destaque, ou o valor guardado quando
    // houver — os dois lugares (aqui e o bloco Debito) sempre concordam.
    const celTotalPeriodo = i => `<td class=n>${celulaSaldoCiclo(i)}`;
    const linhaTotal = '<tr class=tot><td class=c1>Total' +
        (comparacao2Periodos ? '<td class="n colDif"><td class="n colDif">' : '') +
        periodosUsados.map(celTotalPeriodo).join('') +
        (mostraColTotal ? celTotalPeriodo(periodosUsados.at(-1)) : '');

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
