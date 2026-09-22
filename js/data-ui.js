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
async function load() {
    if (API.includes('SEUPROJETO')) return el('out').innerHTML = '<p class=empty>Cole API e KEY no topo do script.</p>';
    console.log('[diag] load() iniciou');
    try {
        console.time('[diag] carregarDados');
        const { lancamentosCrus } = await carregarDados();
        console.timeEnd('[diag] carregarDados');
        console.log('[diag] carregado — ciclos PJ:', Estado.ciclos.length, 'lancamentos:', Estado.lancamentos.length);

        console.time('[diag] atualizarCombos');
        atualizarCombos(lancamentosCrus);
        console.timeEnd('[diag] atualizarCombos');

        desenhar();
        console.log('[diag] load() terminou com sucesso');
    } catch (e) {
        console.error('[diag] load() falhou:', e);
        el('st').textContent = '';
        el('out').innerHTML = '<p class=empty>Falhou: ' + e.message + '</p>';
    }
}

// ===================================================================
// FILTROS — os selects/checkboxes da barra de ferramentas
// ===================================================================
// le um select de 3 estados (Ambos/Sim/Não) e diz se um valor booleano passa no filtro
