// Inicialização da sessão e da aplicação.

// A PWA guarda somente os arquivos estáticos da interface. Dados financeiros continuam
// vindo do Supabase em rede e nunca são persistidos pelo service worker.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
        .catch(() => { /* Instalação da PWA não pode impedir o uso normal da aplicação. */ }));
}

// Botão Voltar/Avançar do navegador: cada troca real de ciclo empurra uma entrada de
// histórico (ver sincronizarCicloNaUrl em js/data-ui.js); aqui só precisamos reagir lendo a
// URL restaurada e redesenhando — sem rebuscar o Supabase, Estado.lancamentos já tem tudo.
// Sem ciclos carregados ainda (antes do primeiro load() ou já deslogado), não há o que redesenhar.
window.addEventListener('popstate', () => {
    if (!Estado.ciclos.length) return;
    aplicarCicloDaUrl();
    desenhar();
});

const mostraTela = logado => {
    el('login').style.display = logado ? 'none' : 'flex';
    el('app').style.display = logado ? 'block' : 'none';
};

// ao abrir a pagina: se ja existe sessao salva, entra direto; senao mostra o login
async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        Estado.emailSessao = session.user?.email || null;
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

    Estado.emailSessao = data.user?.email || null;
    mostraTela(1);
    load();
}

el('email').onkeydown = e => {
    if (e.key == 'Enter') el('senha').focus();
};

el('senha').onkeydown = e => {
    if (e.key == 'Enter') entrar();
};

el('sair').onclick = async () => { await sb.auth.signOut(); Estado.emailSessao = null; el('senha').value = ''; mostraTela(0); };
el('modalDiagnostico').addEventListener('click', e => {
    if (e.target == el('modalDiagnostico')) el('modalDiagnostico').close();
});
el('btDiagnostico').onclick = abrirDiagnosticoDeDados;
el('modalConsolidarTudo').addEventListener('click', e => {
    if (e.target == el('modalConsolidarTudo')) el('modalConsolidarTudo').close();
});
// Só recarrega do banco (sem navegar nem gravar): base da recarga automática abaixo.
async function recarregarDados() {
    const bt = el('recarregar');
    if (bt.disabled) return;
    bt.classList.add('carregando');
    bt.disabled = true;
    try {
        await load();
    } finally {
        bt.classList.remove('carregando');
        bt.disabled = false;
    }
}

// Botão Recarregar (verde, no cabeçalho): numa só ação, recarrega do banco, volta ao ciclo
// atual, limpa os filtros e roda o Consolidar tudo (consolidarTudo em form.js, que recarrega
// primeiro e chama voltarAoCicloAtualELimpar entre a carga e a varredura). A conta restrita
// nunca grava: recarrega, volta ao ciclo atual e limpa, sem consolidar.
el('recarregar').onclick = async () => {
    const bt = el('recarregar');
    if (bt.disabled) return;
    if (!modoRestrito()) { await consolidarTudo(bt, voltarAoCicloAtualELimpar); return; }
    bt.classList.add('carregando');
    bt.disabled = true;
    try {
        if (await load()) voltarAoCicloAtualELimpar();
    } finally {
        bt.classList.remove('carregando');
        bt.disabled = false;
    }
};

// Recarga automática: 5 min depois da última carga bem-sucedida, os dados voltam do banco
// (o que mudou em outro aparelho ou no DataGrip aparece sozinho). Só lê: nunca navega, limpa
// filtro nem consolida — isso é só do clique no botão Recarregar. Nunca no meio de algo:
// só com a tela logada e visível, sem modal aberto, sem campo em edição, sem linha
// selecionada, sem simulação (recarregar apagaria os lançamentos simulados) e sem outra
// carga/gravação em andamento. Ocupado, tenta de novo na próxima verificação (30 s).
const INTERVALO_RECARGA_AUTOMATICA_MS = 5 * 60 * 1000;
const telaLivreParaRecarregar = () =>
    el('app').style.display !== 'none' && !document.hidden && !Estado.simulando &&
    !document.querySelector('dialog[open]') && !Estado.selecionados.size &&
    !document.activeElement?.matches?.('input, select, textarea') &&
    !el('recarregar').disabled;
setInterval(() => {
    if (!Estado.ultimaCarga || Date.now() - Estado.ultimaCarga < INTERVALO_RECARGA_AUTOMATICA_MS) return;
    if (telaLivreParaRecarregar()) recarregarDados();
}, 30 * 1000);

if (API.includes('SEUPROJETO')) { mostraTela(1); load(); }   // sem chaves configuradas: pula o login (modo dev)
else boot();
