// Acesso ao Supabase. Regras de interface ficam nos demais módulos de js/.
const sb = supabase.createClient(API, KEY);
const TAMANHO_LOTE_SUPABASE = 1000;

// Rede ruim (metrô): sem teto, um fetch que perde o sinal no meio fica pendente pra sempre
// e o botão que esperava por ele nunca volta. Cada tentativa tem um limite de tempo.
const LIMITE_REQUISICAO_MS = 12000;
// GET, PATCH e DELETE podem ser repetidos sem mudar o resultado; INSERT não (duplicaria).
const TENTATIVAS_IDEMPOTENTES = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = [1000, 2000];

// Falha sem resposta do servidor (sinal caiu ou estourou o tempo): o pedido pode ou não ter
// chegado ao banco. Um erro HTTP é diferente — é uma resposta de verdade e nunca se repete.
const erroSemResposta = mensagem => Object.assign(Error(mensagem), { semResposta: true });

function comTeto(promessa, oQue) {
    let relogio;
    const estouro = new Promise((_, rejeita) => {
        relogio = setTimeout(() => rejeita(erroSemResposta(`${oQue}: sem resposta em ${LIMITE_REQUISICAO_MS / 1000} s`)), LIMITE_REQUISICAO_MS);
    });
    return Promise.race([promessa, estouro]).finally(() => clearTimeout(relogio));
}

// Lê o corpo dentro do mesmo teto: a conexão pode cair depois dos cabeçalhos, no meio da
// resposta. Devolve o texto já lido, pra quem chama não esperar mais nada da rede.
async function fetchComLimite(url, opcoes, oQue) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), LIMITE_REQUISICAO_MS);
    try {
        const r = await fetch(url, { ...opcoes, signal: controle.signal });
        return { ok: r.ok, status: r.status, texto: await r.text() };
    } catch (err) {
        throw erroSemResposta(controle.signal.aborted
            ? `${oQue}: sem resposta em ${LIMITE_REQUISICAO_MS / 1000} s`
            : `${oQue}: conexão falhou (${err.message})`);
    } finally {
        clearTimeout(relogio);
    }
}

const espera = ms => new Promise(resolve => setTimeout(resolve, ms));

// Só para operações idempotentes. Repete apenas falha sem resposta; erro HTTP sobe direto.
async function comRetentativas(operacao) {
    for (let tentativa = 1; ; tentativa++) {
        try {
            return await operacao(tentativa);
        } catch (err) {
            if (!err.semResposta) throw err;
            if (tentativa >= TENTATIVAS_IDEMPOTENTES) {
                throw erroSemResposta(`${err.message} (${tentativa} tentativas) — pode tentar de novo, repetir não duplica nada`);
            }
            await espera(ESPERA_ENTRE_TENTATIVAS_MS[tentativa - 1]);
        }
    }
}

const tokenAtual = async (forcar) => comTeto((async () => {
    if (forcar) await sb.auth.refreshSession();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token || KEY;
})(), 'sessão');

// `chave`: coluna única e ordenável usada na paginação (fin usa id; fin_ciclo, ancora_id).
const buscar = async (tabela, retry, chave = 'id') => {
    // O limite de linhas da API vale por resposta, mesmo quando a URL pede um limite maior.
    // Paginar pela chave evita truncar silenciosamente a base e não depende de IDs contínuos.
    const linhas = [];
    let ultimoId = null;
    while (true) {
        const depois = ultimoId == null ? '' : `&${chave}=gt.${encodeURIComponent(ultimoId)}`;
        const url = `${API}/rest/v1/${tabela}?select=*&order=${chave}.asc&limit=${TAMANHO_LOTE_SUPABASE}${depois}`;
        // Reconsulta a carga inteira uma única vez após 401: a sessão pode ter sido renovada
        // entre dois lotes e reaproveitar os anteriores criaria duplicatas no resultado.
        const r = await comRetentativas(async () => fetchComLimite(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(retry) } }, 'carregar'));
        if (r.status === 401 && !retry) return buscar(tabela, true, chave);
        if (!r.ok) throw Error(`${tabela}: ${r.status} ${r.texto}`);
        const lote = JSON.parse(r.texto);
        linhas.push(...lote);
        if (lote.length < TAMANHO_LOTE_SUPABASE) return linhas;
        ultimoId = lote.at(-1)[chave];
    }
};

const normalizarCategoriasNoPayload = payload => Object.hasOwn(payload, 'categ')
    ? { ...payload, categ: normalizaCategorias(payload.categ) || null }
    : payload;

const inserirLancamentos = async payloads => {
    // Um único POST com todas as linhas: o PostgREST grava o lote num só INSERT, inteiro ou
    // nada — sinal caindo no meio nunca deixa uma série pela metade. INSERT nunca é repetido
    // sozinho: sem resposta, o lote pode já estar no banco, e repetir duplicaria.
    // Retorna a representação persistida para a tela usar os ids e os defaults reais do banco.
    // A sessão vem antes do try: se ela travar, nada foi enviado e não há o que conferir.
    const token = await tokenAtual();
    let r;
    try {
        r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}`, {
            method: 'POST',
            headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(payloads.map(normalizarCategoriasNoPayload)),
        }, 'inserir');
    } catch (err) {
        if (err.semResposta) throw erroSemResposta(`${err.message} — sem confirmação: pode ter salvado. Recarregue e confira antes de repetir`);
        throw err;
    }
    if (!r.ok) throw Error(`inserir: ${r.status} ${r.texto}`);
    return JSON.parse(r.texto);
};

const inserirLancamento = async payload => (await inserirLancamentos([payload]))[0];

const linhaExiste = async id => {
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}?select=id&id=eq.${encodeURIComponent(id)}`, {
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual() },
    }, 'conferir exclusão');
    if (!r.ok) throw Error(`conferir exclusão: ${r.status} ${r.texto}`);
    return JSON.parse(r.texto).length > 0;
};

const excluirLancamento = async id => comRetentativas(async tentativa => {
    // Prefer retorna a linha removida: resposta vazia denuncia policy/RLS sem fingir sucesso.
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), Prefer: 'return=representation' },
    }, 'excluir');
    if (!r.ok) throw Error(`excluir: ${r.status} ${r.texto}`);
    if (JSON.parse(r.texto).length) return;
    // Numa repetição, a tentativa sem resposta pode ter excluído de fato: só é bloqueio se a
    // linha ainda existir.
    if (tentativa > 1 && !(await linhaExiste(id))) return;
    throw Error('nenhuma linha excluída (RLS/policy do Supabase pode estar bloqueando DELETE)');
});

const atualizarLancamentos = async (ids, campos) => comRetentativas(async () => {
    // Mesmos campos em várias linhas num só PATCH (filtro id=in.(...)).
    const filtro = ids.length === 1 ? `eq.${encodeURIComponent(ids[0])}` : `in.(${ids.map(encodeURIComponent).join(',')})`;
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN}?id=${filtro}`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(normalizarCategoriasNoPayload(campos)),
    }, 'atualizar');
    if (!r.ok) throw Error(`atualizar: ${r.status} ${r.texto}`);
    const linhas = JSON.parse(r.texto);
    if (linhas.length < ids.length) throw Error('nenhuma linha atualizada (RLS/policy do Supabase pode estar bloqueando UPDATE)');
    return linhas;
});

const atualizarLancamento = async (id, campos) => (await atualizarLancamentos([id], campos))[0];

// Grava UMA escolha de um ciclo em fin_ciclo (upsert pela âncora): cria a linha do ciclo na
// 1ª vez e, depois, muda só a coluna enviada. Repetir dá o mesmo resultado, então pode tentar
// de novo sozinho quando não houver resposta, como UPDATE/DELETE.
const salvarLimiteDoCiclo = async (ancoraId, campo, valor) => comRetentativas(async () => {
    const r = await fetchComLimite(`${API}/rest/v1/${TABELA_FIN_CICLO}?on_conflict=ancora_id`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ ancora_id: ancoraId, [campo]: valor }),
    }, 'salvar limite');
    if (!r.ok) throw Error(`salvar limite: ${r.status} ${r.texto}`);
    const linhas = JSON.parse(r.texto);
    if (!linhas.length) throw Error('limite não gravado (RLS/policy do Supabase pode estar bloqueando)');
    return linhas[0];
});

async function carregarDados() {
    const lancamentosCrus = await buscar(TABELA_FIN);
    const diagnosticoDeDados = validarLancamentosCarregados(lancamentosCrus);
    // Sem fin_ciclo (migration 25 ainda não aplicada) a tela carrega igual, com os padrões
    // e um aviso no diagnóstico — os limites por ciclo nunca podem impedir a carga.
    let limitesCiclo = [];
    try {
        limitesCiclo = await buscar(TABELA_FIN_CICLO, false, 'ancora_id');
    } catch (err) {
        diagnosticoDeDados.avisos.push(`Limites por ciclo indisponíveis (${err.message}); usando os padrões. Aplique migrations/25-tabela-fin-ciclo.sql.`);
    }
    Estado.limitesPorAncora = new Map(limitesCiclo.map(linha => [linha.ancora_id, linha]));
    // Faturamento PJ não é uma despesa comum: ele ancora os intervalos de caixa. O último
    // ciclo fica aberto até uma próxima âncora ser cadastrada.
    const ancoras = lancamentosCrus
        .filter(r => !r.cred && String(r.nome || '').trim() === NOME_ANCORA_CICLO && r.data)
        .sort((a, b) => timestamp(a.data) - timestamp(b.data));
    Estado.ciclos = ancoras.map((ancora, i) => ({
        // ancoraId: a linha "Faturamento PJ" guarda os limites de Besteira/Isabella do ciclo.
        id: `pj:${ancora.id}`, ancoraId: ancora.id, ini: dataISO(ancora.data),
        fat: ancoras[i + 1] ? somaDias(dataISO(ancoras[i + 1].data), -1) : '9999-12-31',
    }));
    Estado.lancamentos = lancamentosCrus.map(r => {
        const faturaRef = r.fatura;
        const periodoIdx = !r.data && !faturaRef ? null
            : r.cred ? periodoDaFatura(faturaRef) : periodoDoDebito(dataISO(r.data));
        const categ = normalizaCategorias(r.categ) || null;
        return {
            ...r, categ, fatura: faturaRef ? dataISO(faturaRef) : null, v: +r.valor || 0,
            inv: categoriasSeparadas(categ).some(categoria => /^investimento$/i.test(categoria)),
            periodoIdx: periodoIdx != null && periodoIdx >= 0 && periodoIdx < Estado.ciclos.length ? periodoIdx : null,
        };
    });
    Estado.faturas = [...new Set(Estado.lancamentos.map(r => r.fatura).filter(Boolean))]
        .sort((a, b) => timestamp(a) - timestamp(b)).map(vencimento => ({ vencimento }));
    return { lancamentosCrus, diagnosticoDeDados };
}
