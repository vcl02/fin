// Inicialização da sessão e da aplicação.

const mostraTela = logado => {
    el('login').style.display = logado ? 'none' : 'flex';
    el('app').style.display = logado ? 'block' : 'none';
};

// ao abrir a pagina: se ja existe sessao salva, entra direto; senao mostra o login
async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        mostraTela(1); load();
    } else {
        mostraTela(0);
    }
}
async function entrar() {
    el('lerr').textContent = '';

    const { data, error } = await sb.auth.signInWithPassword({
        email: el('email').value.trim(),
        password: el('senha').value
    });

    if (error) {
        el('lerr').textContent = 'E-mail ou senha inválidos.';
        return;
    }

    mostraTela(1);
    load();
}

el('email').onkeydown = e => {
    if (e.key == 'Enter') el('senha').focus();
};

el('senha').onkeydown = e => {
    if (e.key == 'Enter') entrar();
};

el('sair').onclick = async () => { await sb.auth.signOut(); el('senha').value = ''; mostraTela(0); };
el('fechaDiagnostico').onclick = () => el('modalDiagnostico').close();
el('btDiagnostico').onclick = abrirDiagnosticoDeDados;
// TEMP: permite validar visualmente o toast sem provocar uma falha real de carregamento.
el('btTesteToast').onclick = () => mostrarToast('Erro de teste', 'Toast manual; este botão será removido no próximo commit.');
el('recarregar').onclick = async () => {
    const bt = el('recarregar');

    if (bt.classList.contains('carregando')) return;

    bt.classList.add('carregando');
    bt.disabled = true;

    try {
        await load();
    } finally {
        bt.classList.remove('carregando');
        bt.disabled = false;
    }
};

if (API.includes('SEUPROJETO')) { mostraTela(1); load(); }   // sem chaves configuradas: pula o login (modo dev)
else boot();
