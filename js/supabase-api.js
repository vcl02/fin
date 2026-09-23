// Acesso ao Supabase. Regras de interface ficam nos demais módulos de js/.
const sb = supabase.createClient(API, KEY);

const tokenAtual = async (forcar) => {
    if (forcar) await sb.auth.refreshSession();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token || KEY;
};

const buscar = async (tabela, retry) => {
    // Reconsulta uma única vez após 401 porque a sessão pode ter sido renovada em paralelo.
    const r = await fetch(`${API}/rest/v1/${tabela}?select=*&limit=100000`, { headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(retry) } });
    if (r.status === 401 && !retry) return buscar(tabela, true);
    if (!r.ok) throw Error(`${tabela}: ${r.status} ${await r.text()}`);
    return r.json();
};

const normalizarCategoriasNoPayload = payload => Object.hasOwn(payload, 'categ')
    ? { ...payload, categ: normalizaCategorias(payload.categ) || null }
    : payload;

const inserirLancamento = async payload => {
    // Retorna a representação persistida para a tela usar o id e os defaults reais do banco.
    const r = await fetch(`${API}/rest/v1/${TABELA_FIN}`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(normalizarCategoriasNoPayload(payload)),
    });
    if (!r.ok) throw Error(`inserir: ${r.status} ${await r.text()}`);
    return (await r.json())[0];
};

const excluirLancamento = async id => {
    // Prefer retorna a linha removida: resposta vazia denuncia policy/RLS sem fingir sucesso.
    const r = await fetch(`${API}/rest/v1/${TABELA_FIN}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), Prefer: 'return=representation' },
    });
    if (!r.ok) throw Error(`excluir: ${r.status} ${await r.text()}`);
    if (!(await r.json()).length) throw Error('nenhuma linha excluída (RLS/policy do Supabase pode estar bloqueando DELETE)');
};

const atualizarLancamento = async (id, campos) => {
    const r = await fetch(`${API}/rest/v1/${TABELA_FIN}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(normalizarCategoriasNoPayload(campos)),
    });
    if (!r.ok) throw Error(`atualizar: ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    if (!linhas.length) throw Error('nenhuma linha atualizada (RLS/policy do Supabase pode estar bloqueando UPDATE)');
    return linhas[0];
};

const atualizarReservaEmergenciaPorNome = async (nome, reservaEmergencia) => {
    // A classificação é uma preferência por nome: todos os lançamentos reais com o mesmo
    // texto exato recebem o mesmo valor. encodeURIComponent impede que acentos, espaços e
    // caracteres de URL alterem o filtro PostgREST.
    const filtro = `nome=eq.${encodeURIComponent(nome)}`;
    const r = await fetch(`${API}/rest/v1/${TABELA_FIN}?${filtro}&select=id,nome,reserva`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ reserva: reservaEmergencia }),
    });
    if (!r.ok) throw Error(`atualizar reserva emergência: ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    if (!linhas.length) throw Error('nenhuma linha atualizada (RLS/policy do Supabase pode estar bloqueando UPDATE)');
    return linhas;
};

async function carregarDados() {
    const lancamentosCrus = await buscar(TABELA_FIN);
    const diagnosticoDeDados = validarLancamentosCarregados(lancamentosCrus);
    // Faturamento PJ não é uma despesa comum: ele ancora os intervalos de caixa. O último
    // ciclo fica aberto até uma próxima âncora ser cadastrada.
    const ancoras = lancamentosCrus
        .filter(r => !r.cred && String(r.nome || '').trim() === NOME_ANCORA_CICLO && r.data)
        .sort((a, b) => timestamp(a.data) - timestamp(b.data));
    Estado.ciclos = ancoras.map((ancora, i) => ({
        id: `pj:${ancora.id}`, ini: dataISO(ancora.data),
        fat: ancoras[i + 1] ? somaDias(dataISO(ancoras[i + 1].data), -1) : '9999-12-31',
    }));
    Estado.lancamentos = lancamentosCrus.map(r => {
        const faturaRef = r.fatura || r.fatura_id;
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
