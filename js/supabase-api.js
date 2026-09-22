// Acesso ao Supabase. Regras de interface ficam em script.js.
const sb = supabase.createClient(API, KEY);

const tokenAtual = async (forcar) => {
    if (forcar) await sb.auth.refreshSession();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token || KEY;
};

const buscar = async (tabela, retry) => {
    const r = await fetch(`${API}/rest/v1/${tabela}?select=*&limit=100000`, { headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(retry) } });
    if (r.status === 401 && !retry) return buscar(tabela, true);
    if (!r.ok) throw Error(`${tabela}: ${r.status} ${await r.text()}`);
    return r.json();
};

const inserirLancamento = async payload => {
    const r = await fetch(`${API}/rest/v1/lancamentos`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(payload),
    });
    if (!r.ok) throw Error(`inserir: ${r.status} ${await r.text()}`);
    return (await r.json())[0];
};

const excluirLancamento = async id => {
    const r = await fetch(`${API}/rest/v1/lancamentos?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), Prefer: 'return=representation' },
    });
    if (!r.ok) throw Error(`excluir: ${r.status} ${await r.text()}`);
    if (!(await r.json()).length) throw Error('nenhuma linha excluída (RLS/policy do Supabase pode estar bloqueando DELETE)');
};

const atualizarLancamento = async (id, campos) => {
    const r = await fetch(`${API}/rest/v1/lancamentos?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(campos),
    });
    if (!r.ok) throw Error(`atualizar: ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    if (!linhas.length) throw Error('nenhuma linha atualizada (RLS/policy do Supabase pode estar bloqueando UPDATE)');
    return linhas[0];
};

const atualizarReservaEmergenciaPorNome = async (nome, reservaEmergencia) => {
    const filtro = `nome=eq.${encodeURIComponent(nome)}`;
    const r = await fetch(`${API}/rest/v1/lancamentos?${filtro}&select=id,nome,reserva_emergencia`, {
        method: 'PATCH',
        headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ reserva_emergencia: reservaEmergencia }),
    });
    if (!r.ok) throw Error(`atualizar reserva emergência: ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    if (!linhas.length) throw Error('nenhuma linha atualizada (RLS/policy do Supabase pode estar bloqueando UPDATE)');
    return linhas;
};

async function carregarDados() {
    const lancamentosCrus = await buscar('lancamentos');
    const ancoras = lancamentosCrus
        .filter(r => !r.cred && String(r.nome || '').trim() === 'Faturamento PJ' && r.data)
        .sort((a, b) => timestamp(a.data) - timestamp(b.data));
    Estado.ciclos = ancoras.map((ancora, i) => ({
        id: `pj:${ancora.id}`, ini: dataISO(ancora.data),
        fat: ancoras[i + 1] ? somaDias(dataISO(ancoras[i + 1].data), -1) : '9999-12-31',
    }));
    Estado.lancamentos = lancamentosCrus.map(r => {
        const faturaRef = r.fatura_venc || r.fatura_id;
        const periodoIdx = !r.data && !faturaRef ? null
            : r.cred ? periodoDaFatura(faturaRef) : periodoDoDebito(dataISO(r.data));
        return {
            ...r, fatura_venc: faturaRef ? dataISO(faturaRef) : null, v: +r.valor || 0,
            inv: /^investimento$/i.test(String(r.categ || '').trim()),
            periodoIdx: periodoIdx != null && periodoIdx >= 0 && periodoIdx < Estado.ciclos.length ? periodoIdx : null,
        };
    });
    Estado.faturas = [...new Set(Estado.lancamentos.map(r => r.fatura_venc).filter(Boolean))]
        .sort((a, b) => timestamp(a) - timestamp(b)).map(vencimento => ({ vencimento }));
    return { lancamentosCrus };
}
