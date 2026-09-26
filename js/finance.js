// Cálculos financeiros: saldo, faturas, antecipações, aportes e resgates.

function abatimentosDaBase(base) {
    return alocacaoAntecipacoes(base);
}
let _baseFiltrada = null, _abatFiltrada = null;
function baseEAbatFiltrados() {
    if (!_baseFiltrada) { _baseFiltrada = filtrarLancamentos(); _abatFiltrada = abatimentosDaBase(_baseFiltrada); }
    return { base: _baseFiltrada, abat: _abatFiltrada };
}
let _baseUnica = null, _abatUnica = null;
function baseEAbatContaUnica() {
    if (!_baseUnica) { _baseUnica = baseContaUnica(); _abatUnica = abatimentosDaBase(_baseUnica); }
    return { base: _baseUnica, abat: _abatUnica };
}
function baseContaUnica() {
    return Estado.lancamentos.filter(r => passaFiltroTriEstado('fpago', r.pago));
}
// as 4 caches acima (filtrada e conta unica) sao zeradas em desenhar() a cada redesenho.

// Saldo bruto (ANTES de aplicar Resgate necessario / Aporte sugerido) de um ciclo, a partir de
// uma lista `base` ja filtrada e o `abat` (alocacaoAntecipacoes) JA CALCULADO pra essa base —
// nunca chame alocacaoAntecipacoes aqui dentro. `saldoAnteriorFn` devolve o saldo (com ajuste
// aplicado) do ciclo anterior NA MESMA BASE.
function totalBaseDoCiclo(idx, base, abat, saldoAnteriorFn) {
    if (idx < 0 || !Estado.ciclos[idx]) return 0;
    if (dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return 0;

    const doCiclo = base
        .filter(r => r.periodoIdx === idx && !r.cred)
        .reduce((s, r) => s + r.v, 0);

    const brutoFatura = base
        .filter(r => r.cred && r.periodoIdx === idx)
        .reduce((s, r) => s + r.v, 0);
    const fatura = brutoFatura ? brutoFatura + (abat[idx] || 0) : 0;

    const anterior = idx > 0 && dataISO(Estado.ciclos[idx - 1].fat) >= SALDO_DESDE
        ? saldoAnteriorFn(idx - 1) : 0;

    return anterior + doCiclo + fatura;
}

// Linha sintetica de Resgate necessario / Aporte sugerido de um ciclo, a partir do seu saldo
// bruto (totalBaseDoCiclo). Regra UNICA usada em todo lugar que soma dinheiro por ciclo —
// Ciclo, saldo por dia, Comparar, pizza de gastos e evolucao — pra garantir que o mesmo numero
// e o mesmo criterio apareçam em todos: saldo negativo -> resgate cobrindo o deficit; saldo
// positivo -> aporte sugerido escoando o excedente (sempre, mesmo sem aporte real no ciclo).
// `guardadoDisponivel` (patrimonio acumulado ATE O CICLO ANTERIOR, de guardadoAte(idx-1)) LIMITA
// o resgate: nao da' pra resgatar mais do que existe guardado. Se o deficit for maior que o
// guardado, resgata so' o que tem — o resto do deficit fica negativo de verdade no saldo do
// ciclo, em vez de fingir (via um resgate maior que o patrimonio real) que o mes fechou em zero.
function ajusteInvestimento(totalBase, guardadoDisponivel = Infinity) {
    if (totalBase < -0.005) {
        const deficit = -totalBase;
        const resgate = Math.min(deficit, Math.max(0, guardadoDisponivel));
        if (resgate <= 0.005) return null;   // sem nada guardado pra resgatar — o mes fica negativo, sem linha de ajuste
        return { tipo: 'resgate', nome: 'Resgate necessário', categ: CATEGORIA_INVESTIMENTO, v: resgate };
    }
    if (totalBase > TOLERANCIA_FINANCEIRA) return { tipo: 'aporte', nome: 'Aporte sugerido', categ: CATEGORIA_INVESTIMENTO, v: -totalBase };
    return null;
}

// Total do bloco Debito de um ciclo: lancamentos + fatura + saldo do ciclo anterior + o
// Resgate necessario / Aporte sugerido do proprio ciclo. E' recursivo — cada ciclo carrega o
// anterior — e para no SALDO_DESDE. Respeita os filtros de Origem/Titular; pra conta unica
// ignorando Titular, ver saldoCicloContaUnica. Memoizado (idx -> total, idx -> ajuste) porque
// a cascata reprocessa os mesmos ciclos varias vezes por render.
const _cacheSaldo = {};
const _cacheAjuste = {};
function saldoDoCiclo(idx) {
    if (idx < 0 || !Estado.ciclos[idx]) return 0;
    if (dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return 0;
    if (_cacheSaldo[idx] != null) return _cacheSaldo[idx];

    _cacheSaldo[idx] = 0;   // trava recursao circular enquanto calcula

    const { base, abat } = baseEAbatFiltrados();
    const totalBase = totalBaseDoCiclo(idx, base, abat, saldoDoCiclo);
    const ajuste = ajusteInvestimento(totalBase,
        guardadoDisponivelNoCiclo(idx, base, guardadoAte(idx - 1)));
    _cacheAjuste[idx] = ajuste;
    const total = totalBase + (ajuste ? ajuste.v : 0);

    _cacheSaldo[idx] = total;
    return total;
}
// Resgate necessario / Aporte sugerido de um ciclo (base "respeita filtros"). SEMPRE usar
// esta funcao em vez de chamar totalBaseDoCiclo/ajusteInvestimento direto — ela reaproveita
// o calculo memoizado de saldoDoCiclo, garantindo O(1) amortizado por idx no render inteiro.
function ajusteDoCiclo(idx) {
    if (idx < 0 || !Estado.ciclos[idx] || dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return null;
    saldoDoCiclo(idx);   // efeito colateral: preenche _cacheAjuste[idx]
    return _cacheAjuste[idx] || null;
}

// Mesma logica de saldoDoCiclo, mas na base "conta unica" (so Pago, ignora Origem/
// Titular) — usada por saldoPorDia e pela pizza de gastos, que ja tratavam a conta como
// uma so antes desta mudanca. Cache proprio pra nao misturar com _cacheSaldo/_cacheAjuste.
const _cacheSaldoUnico = {};
const _cacheAjusteUnico = {};
function saldoCicloContaUnica(idx) {
    if (idx < 0 || !Estado.ciclos[idx]) return 0;
    if (dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return 0;
    if (_cacheSaldoUnico[idx] != null) return _cacheSaldoUnico[idx];

    _cacheSaldoUnico[idx] = 0;

    const { base, abat } = baseEAbatContaUnica();
    const totalBase = totalBaseDoCiclo(idx, base, abat, saldoCicloContaUnica);
    const ajuste = ajusteInvestimento(totalBase,
        guardadoDisponivelNoCiclo(idx, base, guardadoAteContaUnica(idx - 1)));
    _cacheAjusteUnico[idx] = ajuste;
    const total = totalBase + (ajuste ? ajuste.v : 0);

    _cacheSaldoUnico[idx] = total;
    return total;
}
// Resgate necessario / Aporte sugerido de um ciclo (base "conta unica"). Mesma ideia de
// ajusteDoCiclo, so que pra quem ignora o filtro de Titular (saldoPorDia, pizza de gastos).
function ajusteDoCicloContaUnica(idx) {
    if (idx < 0 || !Estado.ciclos[idx] || dataISO(Estado.ciclos[idx].fat) < SALDO_DESDE) return null;
    saldoCicloContaUnica(idx);
    return _cacheAjusteUnico[idx] || null;
}

// Saldo em conta ao fim de cada dia, acumulado desde SALDO_INICIAL. Considera o que
// de fato passa pela conta: os debitos (compra no credito nao sai da conta) mais as
// linhas sinteticas de fatura, que representam o que ainda vai sair no vencimento, mais
// o Resgate necessario / Aporte sugerido de cada ciclo (na data de fechamento dele) — pra
// que o saldo do ultimo dia do ciclo bata com saldoCicloContaUnica(idx).
// Ignora o filtro de Titular — a conta e' uma so.
function saldoPorDia() {
    const { base, abat } = baseEAbatContaUnica();

    // faturas em aberto de todos os ciclos, ja liquidas de antecipacao
    const faturas = [];
    Estado.ciclos.forEach((per, idx) => {
        const bruto = base
            .filter(r => r.cred && r.periodoIdx === idx)
            .reduce((s, r) => s + r.v, 0);
        if (!bruto) return;
        const liquido = bruto + (abat[idx] || 0);
        const venc = vencimentoDoCiclo(idx);
        if (Math.abs(liquido) > 0.005) faturas.push({ data: venc, v: liquido });
    });

    // um evento de Resgate/Aporte por ciclo, na data de fechamento (usa o cache — nunca
    // recalcula alocacaoAntecipacoes por periodo)
    const ajustes = [];
    Estado.ciclos.forEach((per, idx) => {
        const ajuste = ajusteDoCicloContaUnica(idx);
        if (ajuste) ajustes.push({ data: dataISO(per.fat), v: ajuste.v });
    });

    const eventos = [
        ...base
            .filter(r => !r.cred && r.data && !ehTransferenciaFatura(r))
            .map(r => ({ data: dataISO(r.data), v: r.v })),
        ...faturas,
        ...ajustes,
    ]
        .filter(e => e.data >= SALDO_DESDE)
        .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

    const saldo = {};
    let acc = SALDO_INICIAL;
    eventos.forEach(e => { acc += e.v; saldo[e.data] = acc; });
    return saldo;
}


// Quanto esta guardado no fim do ciclo: todos os aportes menos todos os resgates REAIS, de
// todos os ciclos ate este, MAIS o efeito hipotetico do Resgate necessario / Aporte sugerido
// de cada ciclo ate aqui (tratado como se o dinheiro tivesse de fato mudado de bolso, do
// mesmo jeito que um aporte/resgate real ja lancado). Nao entra no saldo da conta — e'
// patrimonio separado.
function guardadoAte(idx) {
    const reais = filtrarLancamentos()
        .filter(r => r.inv && r.periodoIdx != null && r.periodoIdx <= idx)
        .reduce((s, r) => s - r.v, 0);

    let hipotetico = 0;
    for (let i = 0; i <= idx; i++) {
        const ajuste = ajusteDoCiclo(i);
        if (ajuste) hipotetico -= ajuste.v;
    }

    return reais + hipotetico;
}

// Quanto SOBRA pra bancar o Resgate necessario do ciclo `idx`: o guardado que veio do ciclo
// anterior MENOS o efeito dos investimentos REAIS ja lancados dentro do proprio ciclo `idx`.
// Sem descontar esses, um resgate real do mes (ex: R$2.456,34) era ignorado no limite e o
// Resgate necessario podia sacar dinheiro que aquele resgate real ja tinha levado — deixando
// o guardado negativo e sobrando um residuo no saldo do ciclo (o caso "-R$10,00" no titulo
// do Debito, com o guardado do mes seguinte aparecendo em -9,99).
function guardadoDisponivelNoCiclo(idx, base, guardadoAnterior) {
    const reaisDoCiclo = base
        .filter(r => r.inv && r.periodoIdx === idx)
        .reduce((s, r) => s - r.v, 0);
    return guardadoAnterior + reaisDoCiclo;
}

// Mesma logica de guardadoAte, mas na base "conta unica" (ignora o filtro de Titular) —
// usada so' pra limitar o Resgate necessario de saldoCicloContaUnica/ajusteDoCicloContaUnica
// (saldoPorDia, pizza de gastos), que tem que respeitar a MESMA base que calculou o saldo,
// nunca misturar com a base filtrada por Titular que guardadoAte usa.
function guardadoAteContaUnica(idx) {
    const reais = baseContaUnica()
        .filter(r => r.inv && r.periodoIdx != null && r.periodoIdx <= idx)
        .reduce((s, r) => s - r.v, 0);

    let hipotetico = 0;
    for (let i = 0; i <= idx; i++) {
        const ajuste = ajusteDoCicloContaUnica(i);
        if (ajuste) hipotetico -= ajuste.v;
    }

    return reais + hipotetico;
}

// HTML do saldo de um ciclo com o mesmo tratamento usado no titulo do bloco Debito: ciclo
// equalizado (saldo ~0) vira destaque verde de sucesso — "R$ 0,00" sem nada guardado, ou
// so' o valor guardado quando houver (o guardado ja fala por si, sem repetir o "R$ 0,00").
// Saldo negativo (faltou) continua mostrando o valor normal, sem tratamento especial. Usado
// tanto no titulo do bloco Debito (vCiclo) quanto na linha Total da matriz Comparar, pra os
// dois lugares sempre concordarem sobre o mesmo mes.
function celulaSaldoCiclo(idx) {
    const total = saldoDoCiclo(idx);
    const guardado = guardadoAte(idx);
    const temGuardado = Math.abs(guardado) > 0.005;
    if (Math.abs(total) < 0.005) {
        // guardado pode ser NEGATIVO (resgatou mais do que aportou historicamente) — a
        // cor segue o sinal de verdade, nunca fixa em verde
        return temGuardado ? `<b class="${corValor(guardado)}">${brl(guardado)}</b>` : `<b class=vd>${brl(0)}</b>`;
    }
    return `<span class="${corSoma(total)}">${brl(total)}</span>`;
}



// Visão "Ciclo": mostra um periodo por vez, com os blocos Debito e Credito (ou o Backlog).
// O Crédito é uma prévia visual: no ciclo N mostra as compras da fatura do ciclo N+1.
// O cálculo da fatura e do Débito continua usando os créditos do próprio ciclo N.
function creditosExibidosNoCiclo(linhas, idxCiclo) {
    return linhas.filter(r => r.cred && r.periodoIdx === idxCiclo + 1);
}
// Mesmo saldo líquido da linha dinâmica de fatura: compras brutas menos as antecipações.
function totalCreditoExibidoAposAntecipacoes(creditos, valorAntecipado = 0) {
    return creditos.reduce((soma, r) => soma + r.v, 0) + valorAntecipado;
}

// "Hoje" é um retrato de caixa, não uma previsão: só movimentos reais já marcados como
// pagos e cuja data já chegou podem compô-lo. Compras no crédito continuam fora do saldo
// de caixa, pois ainda não saíram da conta; antecipações reais entram como qualquer débito.
function lancamentosPagosAte(linhas, dataLimite = hojeISO()) {
    return linhas.filter(r => r.pago && r.data && dataISO(r.data) <= dataLimite);
}

// Separa explicitamente o dinheiro disponível do patrimônio guardado no instante atual.
// O saldo nasce no mesmo SALDO_DESDE da cascata dos ciclos: antes dele não há saldo inicial
// confiável e os registros históricos não podem contaminar o retrato de hoje. Saldo inclui
// aporte/resgate porque o dinheiro efetivamente sai/volta para a conta; guardado mostra essa
// parcela separada e nunca conta sugestões sintéticas de futuro.
function resumoDebitoPagoAte(linhas, dataLimite = hojeISO()) {
    const pagos = lancamentosPagosAte(linhas, dataLimite)
        .filter(r => !r.cred && dataISO(r.data) >= SALDO_DESDE);
    return {
        saldo: pagos.reduce((soma, r) => soma + (+r.v || 0), 0),
        guardado: pagos
            .filter(r => r.inv)
            .reduce((soma, r) => soma - (+r.v || 0), 0),
    };
}

// O limite garantido só pode usar dinheiro realmente registrado como investimento: aportes
// negativos aumentam a garantia e resgates positivos a reduzem. Recebe a lista inteira para
// não obedecer ao filtro visual Pago (nem contar Aporte sugerido, que é linha sintética).
function guardadoGarantidoAte(linhas, idx) {
    return linhas
        .filter(r => r.inv && r.periodoIdx != null && r.periodoIdx <= idx)
        .reduce((soma, r) => soma - (+r.v || 0), 0);
}

// O limite do cartão é diferente da fatura exibida: crédito Aberto é só projeção e não
// compromete o cartão. Crédito Pago já virou compra real; uma antecipação da mesma fatura
// libera esse valor, até o saldo chegar a zero. `abatidoPorCiclo` vem da mesma alocação
// usada pela fatura para nunca liberar mais que o pagamento realmente abateu.
function limiteCartaoOcupado(linhas, abatidoPorCiclo = {}) {
    const confirmadoPorCiclo = new Map();
    linhas.forEach(r => {
        if (!r.cred || !r.pago || r.periodoIdx == null) return;
        confirmadoPorCiclo.set(r.periodoIdx, (confirmadoPorCiclo.get(r.periodoIdx) || 0) + (+r.v || 0));
    });
    return Array.from(confirmadoPorCiclo, ([idx, total]) =>
        Math.max(0, -total - (abatidoPorCiclo[idx] || 0))
    ).reduce((soma, restante) => soma + restante, 0);
}

// O guardado positivo que aparece no título de Débito é aplicado na garantia da Nubank.
// Ele aumenta o teto utilizável do cartão no ciclo atual; valor negativo nunca reduz o limite
// contratado, pois só dinheiro efetivamente guardado pode estar como garantia.
function limiteCartaoTotal(guardadoDoCiclo = 0) {
    return LIMITE_CARTAO + Math.max(0, +guardadoDoCiclo || 0);
}

function limiteCartaoLivre(linhas, abatidoPorCiclo = {}, guardadoDoCiclo = 0) {
    return limiteCartaoTotal(guardadoDoCiclo) - limiteCartaoOcupado(linhas, abatidoPorCiclo);
}
