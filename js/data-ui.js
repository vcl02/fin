// Carregamento dos dados e atualização dos seletores da interface.

// Interface: carregamento, filtros, tabelas, visões, gráficos e formulários.

function atualizarCombos(lancamentosCrus) {
    const selecaoAnterior = el('ciclo').value;
    const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const idxAtual = Estado.ciclos.findIndex(per => hoje >= per.ini && hoje <= dataISO(per.fat));
    const usados = [...new Set(Estado.lancamentos.map(r => r.periodoIdx).filter(p => p != null))];

    if (idxAtual >= 0 && !usados.includes(idxAtual)) usados.push(idxAtual);
    usados.sort((a, b) => a - b);
    const opcoesCiclo = '<option value=-1>Backlog' + usados.map(i => `<option value=${i}>${nomePeriodo(Estado.ciclos[i])}`).join('');
    el('ciclo').innerHTML = opcoesCiclo;

    // preserva a selecao anterior se ainda for valida; senao cai no periodo atual (ou no mais recente usado)
    const valorAnterior = selecaoAnterior === '' ? null : +selecaoAnterior;
    const valorEscolhido = valorAnterior !== null && (valorAnterior < 0 || usados.includes(valorAnterior))
        ? valorAnterior
        : (idxAtual >= 0 ? idxAtual : usados.at(-1) ?? -1);
    el('ciclo').value = valorEscolhido;

    Estado.idxHoje = idxAtual;      // ancora do pre-preenchimento inicial de De/Ate (ciclo atual + proximo)

    // Comparar sempre agrupa por Categoria agora (sem filtro "Agrupar por" na toolbar) —
    // ver vComp(), que fixa coluna='categ' direto.

    // Categoria do formulario e' populada por popularCategoriasNoForm() (ordenada por uso
    // recente), chamada toda vez que o modal abre — nao precisa duplicar aqui.

    // Os combos conservam todos os ciclos usados. No mobile, modoSimples() limita apenas
    // a visualização a um ciclo por vez, sem uma regra paralela de navegação. "Todos"
    // (value vazio) é a opção padrão.
    // Backlog só existe no De, pois não faz sentido compará-lo com outro período.
    const usadosNaveg = usados;
    const opcoesPeriodo = '<option value="">Todos</option>' + usadosNaveg.map(i => `<option value=${i}>${nomePeriodo(Estado.ciclos[i])}`).join('');
    const opcoesPeriodoDe = '<option value="">Todos</option><option value=-1>Backlog' + usadosNaveg.map(i => `<option value=${i}>${nomePeriodo(Estado.ciclos[i])}`).join('');
    const deAnterior = el('compDe').value, ateAnterior = el('compAte').value;

    el('compDe').innerHTML = opcoesPeriodoDe;
    el('compAte').innerHTML = opcoesPeriodo;
    el('compDe').value = deAnterior == '-1' || usadosNaveg.includes(+deAnterior) ? deAnterior : '';
    el('compAte').value = usadosNaveg.includes(+ateAnterior) ? ateAnterior : '';
}

// Fluxo completo de carga: busca dados, atualiza os combos, mostra o contador e desenha a tela.
// E a unica funcao chamada de fora (pelo botao de recarregar e pelo login).
// Problemas precisam ficar visíveis para quem usa a tela, mas sem modificar dados nem
// despejar métricas no console. O mesmo modal serve para aviso de dados e falhas reais.
function mostrarDiagnostico(titulo, texto, itens) {
    el('tituloDiagnostico').textContent = titulo;
    el('textoDiagnostico').textContent = texto;
    el('listaDiagnostico').replaceChildren(...itens.map(item => {
        const linha = document.createElement('li');
        linha.textContent = item;
        return linha;
    }));
    if (!el('modalDiagnostico').open) el('modalDiagnostico').showModal();
}

let avisosDeDadosAtuais = [];

// A última carga decide o estado do ícone. O modal só abre por escolha do usuário para
// não interromper a consulta, mas o vermelho deixa claro que há algo a revisar.
function atualizarBotaoDiagnostico(avisos) {
    avisosDeDadosAtuais = avisos;
    const temInconsistencia = avisos.length > 0;
    const botao = el('btDiagnostico');
    botao.classList.toggle('temInconsistencia', temInconsistencia);
    const descricao = temInconsistencia
        ? `${avisos.length} inconsistência${avisos.length === 1 ? '' : 's'} na última carga`
        : 'Sem inconsistências na última carga';
    botao.setAttribute('aria-label', descricao);
    botao.title = descricao;
}

function abrirDiagnosticoDeDados() {
    if (!avisosDeDadosAtuais.length) {
        mostrarDiagnostico('Dados verificados', 'Nenhuma inconsistência foi identificada na última carga.', []);
        return;
    }
    mostrarDiagnostico('Dados para revisar', 'Nada foi alterado. Revise estes lançamentos no banco:', avisosDeDadosAtuais);
}

const LIMIAR_CARGA_LENTA_MS = 1000;
let contextoAudioToast;

// Um tom curto dá presença ao toast sem exigir arquivo externo. Navegadores podem bloquear
// áudio antes da primeira interação; nesse caso o aviso visual continua sendo suficiente.
async function tocarSomToast() {
    try {
        const ContextoAudio = window.AudioContext || window.webkitAudioContext;
        if (!ContextoAudio) return;
        contextoAudioToast ??= new ContextoAudio();
        if (contextoAudioToast.state === 'suspended') await contextoAudioToast.resume();
        const oscilador = contextoAudioToast.createOscillator();
        const ganho = contextoAudioToast.createGain();
        oscilador.type = 'sine';
        oscilador.frequency.value = 660;
        ganho.gain.setValueAtTime(.0001, contextoAudioToast.currentTime);
        ganho.gain.exponentialRampToValueAtTime(.012, contextoAudioToast.currentTime + .01);
        ganho.gain.exponentialRampToValueAtTime(.0001, contextoAudioToast.currentTime + .09);
        oscilador.connect(ganho).connect(contextoAudioToast.destination);
        oscilador.start();
        oscilador.stop(contextoAudioToast.currentTime + .1);
    } catch {
        // Falha de permissão/autoplay não deve impedir nem registrar ruído para um toast.
    }
}

// Toast é reservado a estado operacional passageiro; não mistura uma falha de rede com
// inconsistências persistentes dos registros, que precisam ser lidas no modal.
function mostrarToast(titulo, texto) {
    void tocarSomToast();
    const toast = document.createElement('article');
    const tituloToast = document.createElement('strong');
    const descricao = document.createElement('p');
    const fechar = document.createElement('button');
    tituloToast.textContent = titulo;
    descricao.textContent = texto;
    fechar.type = 'button';
    fechar.textContent = '×';
    fechar.title = 'Fechar';
    fechar.setAttribute('aria-label', 'Fechar');
    const remover = () => toast.remove();
    fechar.onclick = remover;
    toast.className = 'toast';
    toast.append(tituloToast, fechar, descricao);
    el('toasts').append(toast);
    setTimeout(remover, 7000);
}

async function load() {
    if (API.includes('SEUPROJETO')) return el('out').innerHTML = '<p class=empty>Cole API e KEY no topo do script.</p>';
    const inicioCarga = performance.now();
    try {
        const { lancamentosCrus, avisosDeDados } = await carregarDados();
        const aposDados = performance.now();
        atualizarCombos(lancamentosCrus);
        const aposCombos = performance.now();

        desenhar();
        const aposRender = performance.now();
        const cargaMs = Math.round(aposRender - inicioCarga);
        console.info(`[diag] carga ${cargaMs}ms | combos ${Math.round(aposCombos - aposDados)}ms | render ${Math.round(aposRender - aposCombos)}ms | ${Estado.ciclos.length} ciclos | ${Estado.lancamentos.length} lançamentos`);
        if (cargaMs >= LIMIAR_CARGA_LENTA_MS) mostrarToast('Carga lenta', `A tela levou ${(cargaMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s.`);
        atualizarBotaoDiagnostico(avisosDeDados);
    } catch (e) {
        el('st').textContent = '';
        el('out').innerHTML = '<p class=empty>Falhou: ' + e.message + '</p>';
        mostrarToast('Não foi possível carregar', e.message);
    }
}

// ===================================================================
// FILTROS — os selects/checkboxes da barra de ferramentas
// ===================================================================
// le um select de 3 estados (Ambos/Sim/Não) e diz se um valor booleano passa no filtro
