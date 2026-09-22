// Cadastro, calculadora e simulação de lançamentos.

const modalNovo = el('modalNovo');

// mascara de dinheiro: mantem so digitos e desloca 2 casas decimais, tipo caixa eletronico.
function formataMascaraDinheiro(valorDigitado) {
    const digitos = valorDigitado.replace(/\D/g, '');
    const numero = parseInt(digitos || '0', 10) / 100;
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function valorMascaraParaNumero(textoMascarado) {
    const digitos = textoMascarado.replace(/\D/g, '');
    return parseInt(digitos || '0', 10) / 100;
}
el('fValor').addEventListener('input', e => {
    const cursorNoFim = e.target.selectionEnd == e.target.value.length;
    e.target.value = formataMascaraDinheiro(e.target.value);
    if (cursorNoFim) e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    atualizaSinalUI();
});

let sinalPositivo = false;
function atualizaSinalUI() {
    const semValor = valorMascaraParaNumero(el('fValor').value || '0') === 0;
    el('fSinal').disabled = semValor;
    el('fSinal').classList.toggle('pos', sinalPositivo && !semValor);
    el('fSinal').classList.toggle('neutro', semValor);
    el('fSinal').textContent = semValor ? '±' : (sinalPositivo ? '+' : '−');
}
el('fSinal').onclick = () => { sinalPositivo = !sinalPositivo; atualizaSinalUI(); };

// ---- categorias ordenadas por uso nos ultimos 3 meses ----
// conta quantas vezes cada categoria apareceu em lancamentos dos ultimos ~90 dias;
// a mais usada fica primeiro na lista do <select>.
function categoriasPorPopularidade() {
    const limite = new Date(); limite.setDate(limite.getDate() - 90);
    const limiteIso = limite.toISOString().slice(0, 10);
    const contagem = {};
    Estado.lancamentos.forEach(r => {
        if (!r.categ || !r.data || dataISO(r.data) < limiteIso) return;
        contagem[r.categ] = (contagem[r.categ] || 0) + 1;
    });
    const todas = [...new Set(Estado.lancamentos.map(r => r.categ).filter(valorValido))];
    return todas.sort((a, b) => (contagem[b] || 0) - (contagem[a] || 0) || a.localeCompare(b, 'pt'));
}
function popularCategoriasNoForm(idSelect = 'fCateg') {
    const select = el(idSelect);
    const atual = select.value;
    select.innerHTML = '<option value="" disabled selected>Selecione…</option>' +
        categoriasPorPopularidade().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (atual) select.value = atual;
}

// ---- busca de categoria por nome parecido ----
// ao digitar o Nome, procura nos lancamentos existentes um nome IGUAL (case/acento
// insensitivo) ou que COMECE igual, pega o mais recente com esse nome, e usa a
// categoria dele. So marca como "achado" (pra pular a Categoria no Enter) quando
// a categoria foi de fato preenchida por essa busca.
function buscaCategoriaPorNome(nomeDigitado) {
    const alvo = semAcento(nomeDigitado.trim());
    if (!alvo) return null;
    const candidatos = Estado.lancamentos
        .filter(r => r.nome && r.categ && valorValido(r.categ))
        .filter(r => { const n = semAcento(r.nome); return n === alvo || n.startsWith(alvo) || alvo.startsWith(n); })
        .sort((a, b) => dataISO(b.data || '') < dataISO(a.data || '') ? -1 : 1);   // mais recente primeiro
    return candidatos[0]?.categ || null;
}
// conforme digita o Nome, tenta achar por proximidade uma categoria ja usada com esse
// nome antes e pre-seleciona no combo (voce ainda pode trocar manualmente).
el('fNome').addEventListener('input', () => {
    const categ = buscaCategoriaPorNome(el('fNome').value);
    if (categ && categoriasPorPopularidade().includes(categ)) el('fCateg').value = categ;
});

// atalhos de Enter nos dois campos de texto: Nome -> foca Valor; Valor -> salva
el('fNome').addEventListener('keydown', e => {
    if (e.key == 'Enter') { e.preventDefault(); el('fValor').focus(); }
});
el('fValor').addEventListener('keydown', e => {
    if (e.key != 'Enter') return;
    e.preventDefault();
    // so salva por Enter se os obrigatorios (Nome e Categoria) ja estao preenchidos.
    // senao, ignora em silencio (sem aviso, sem mover foco).
    if (el('fNome').value.trim() && el('fCateg').value) submeteNovoLancamento();
});

// ---- abrir modal: foco no Nome, categorias populares, Isa so pra quem nao e' a Isabella ----
// select de Parcelas so' precisa ser populado uma vez (1x a 40x) — nao muda entre aberturas
if (el('fParcelas').options.length < 40) {
    for (let n = 2; n <= 40; n++) el('fParcelas').add(new Option(`${n}x`, n));
}

// "Dividir valor entre as vezes" e' independente de Credito/Debito — o usuario escolhe
// nos dois modos (ver submeteNovoLancamento: marcado, o valor digitado e' DIVIDIDO entre
// as N linhas, ex: R$300 em 3x = R$100 cada; desmarcado, o valor se REPETE em cada uma,
// ex: R$50 3x = R$50 + R$50 + R$50 — util pra lancar de uma vez uma assinatura/conta
// recorrente de valor fixo). So' um PALPITE inicial segue Credito ao ligar/desligar (compras
// no credito costumam ser parceladas — dividir; contas fora do credito costumam repetir o
// mesmo valor todo mes) — o usuario pode mudar na hora, o toggle nao trava em nada.
function sugereModoValorParcelas() {
    el('fDivide').checked = el('fCred').checked;
}

function nomeFatura(fatura) {
    const venc = dataISO(fatura.vencimento);
    const ano = venc.slice(0, 4);
    const mes = +venc.slice(5, 7);
    return `${MESES[mes - 1]} ${ano} — vence ${dataBR(fatura.vencimento)}`;
}

function idsFaturasDoFormulario(incluirSugestoes = true) {
    return [...document.querySelectorAll('[data-fatura-parcela]')]
        .map(select => !incluirSugestoes && select.dataset.faturaSugerida === '1'
            ? null
            : (select.value ? dataISO(select.value) : null));
}

function opcoesFaturasDisponiveis() {
    // DISTINCT estrito de todas as datas de vencimento que realmente existem nos lancamentos
    const faturasSet = new Set();
    Estado.lancamentos.forEach(r => {
        const v = r.fatura || r.fatura_id;
        if (v) faturasSet.add(dataISO(v));
    });

    return [...faturasSet]
        .sort((a, b) => timestamp(a) - timestamp(b))
        .map(venc => ({ vencimento: venc, rotulo: nomeFatura({ vencimento: venc }) }));
}

// No modo de simulacao, cada prestacao ja nasce apontando para a fatura disponivel
// mais proxima da sua propria data. E' apenas um palpite: os <select>s continuam
// independentes para que a pessoa possa trocar qualquer parcela antes de simular.
function faturasSugeridasParaParcelas(faturas, data, parcelas, freq) {
    if (!data || !faturas.length) return Array(parcelas).fill(null);
    const vencimentos = faturas
        .map(f => dataISO(f.vencimento))
        .sort((a, b) => timestamp(a) - timestamp(b));
    return Array.from({ length: parcelas }, (_, p) => {
        const dataParcela = dataDaOcorrencia(data, p, freq);
        return vencimentos.find(vencimento => vencimento >= dataParcela)
            // Se a simulacao ultrapassar a ultima fatura ja conhecida, deixa a
            // ultima como ponto de partida editavel em vez de abrir um campo vazio.
            || vencimentos[vencimentos.length - 1];
    });
}

// Credito nao tem mais inferencia por fechamento: cada parcela recebe seu vencimento
// explicitamente. Assim uma compra 3x pode apontar para tres faturas diferentes.
// Antecipacao de fatura (debito) tambem exige uma fatura explicita para abatimento direto.
function atualizarFaturasDoFormulario(idsSelecionados = idsFaturasDoFormulario()) {
    const wrap = el('fFaturasWrap');
    const destino = el('faturasPorParcela');
    const cred = el('fCred').checked;
    const categ = el('fCateg').value || '';
    const ehAntecip = ehAntecipacaoFatura(categ);
    wrap.hidden = !cred && !ehAntecip;
    if (!cred && !ehAntecip) { destino.innerHTML = ''; return; }

    const parcelas = +el('fParcelas').value || 1;
    const faturasMap = new Map();

    // DISTINCT das datas de vencimento existentes
    opcoesFaturasDisponiveis().forEach(f => {
        faturasMap.set(dataISO(f.vencimento), f.rotulo);
    });

    // Se houver fatura pré-selecionada / prefill que ainda não está na lista, inclui
    idsSelecionados.forEach(sel => {
        if (sel && !faturasMap.has(dataISO(sel))) {
            const iso = dataISO(sel);
            faturasMap.set(iso, nomeFatura({ vencimento: iso }));
        }
    });

    const faturas = [...faturasMap.entries()]
        .sort((a, b) => timestamp(a[0]) - timestamp(b[0]))
        .map(([venc, rotulo]) => ({ vencimento: venc, rotulo }));
    // O mesmo preenchimento inicial vale no cadastro real e na simulação. A sugestão
    // nunca substitui uma fatura que a pessoa já escolheu manualmente.
    const sugestoes = cred
        ? faturasSugeridasParaParcelas(faturas, el('fData').value, parcelas, el('fFreq').value)
        : [];

    const opcoes = faturas.map(f =>
        `<option value="${dataISO(f.vencimento)}">${escapeHtml(f.rotulo || nomeFatura(f))}</option>`
    ).join('');
    destino.innerHTML = Array.from({ length: parcelas }, (_, parcela) => {
        const selecionada = idsSelecionados[parcela] || sugestoes[parcela];
        const titulo = parcelas > 1 ? `Parcela ${parcela + 1}` : 'Fatura';
        return `<label class=fm><span>${titulo} <b class=req>*</b></span>` +
            `<select data-fatura-parcela="${parcela}" data-fatura-sugerida="${!idsSelecionados[parcela] && sugestoes[parcela] ? '1' : '0'}" required>` +
            `<option value="" disabled${selecionada ? '' : ' selected'}>Selecione a fatura…</option>` +
            opcoes +
            '</select></label>';
    }).join('');

    [...document.querySelectorAll('[data-fatura-parcela]')].forEach((select, parcela) => {
        const sel = idsSelecionados[parcela] || sugestoes[parcela];
        if (sel) {
            select.value = dataISO(sel);
        }
        select.addEventListener('change', () => { select.dataset.faturaSugerida = '0'; });
    });
}

el('fCred').addEventListener('change', () => {
    sugereModoValorParcelas();
    atualizarFaturasDoFormulario();
});

// quando a categoria muda pra "Antecipacao Fatura" (debito), o seletor de fatura
// deve aparecer igual ao credito — e desaparecer se sair dessa categoria.
el('fCateg').addEventListener('change', () => atualizarFaturasDoFormulario());

// Uma sugestao ainda automatica acompanha a data da venda; uma fatura escolhida
// manualmente nunca e' substituida por esse recálculo.
el('fData').addEventListener('change', () => {
    if (el('fCred').checked) {
        atualizarFaturasDoFormulario(idsFaturasDoFormulario(false));
    }
});
el('fFreq').addEventListener('change', () => {
    if (el('fCred').checked) {
        atualizarFaturasDoFormulario(idsFaturasDoFormulario(false));
    }
});

// Frequencia abre em "— Sem recorrencia", que e' o certo pra compra avulsa (1x) — o caso
// mais comum de longe, e o que mantem a coluna Frequencia significando alguma coisa (se
// todo lancamento nascesse "Mensal", a coluna nao distinguiria mais nada). A partir de 2x
// a recorrencia passa a IMPORTAR (e' ela que decide a data de cada ocorrencia, ver
// dataDaOcorrencia), entao aqui ela sobe pro padrao Mensal sozinha — so' quando ainda
// estava vazia, pra nunca atropelar uma escolha explicita (Semanal, Anual...).
el('fParcelas').addEventListener('change', () => {
    if (+el('fParcelas').value > 1 && !el('fFreq').value) el('fFreq').value = 'Mensal';
    atualizarFaturasDoFormulario();
});

function abreModalNovo(prefill) {
    el('formNovo').reset();
    popularCategoriasNoForm();
    el('fCateg').selectedIndex = 0;
    sinalPositivo = false;
    el('erroNovo').textContent = ''; el('erroNovo').classList.remove('ok');
    el('fIsaWrap').hidden = false;

    // titulo e aviso mudam conforme o modo simulacao global (Estado.simulando): o MESMO
    // formulario serve pra lancamento real (vai pro banco) e simulado (so' memoria) —
    // ver submeteNovoLancamento, que decide o destino no momento de salvar.
    el('avisoSimulando').hidden = !Estado.simulando;
    el('tituloNovo').textContent = Estado.simulando
        ? 'Simular compra'
        : (prefill ? 'Duplicar lançamento' : 'Novo lançamento');
    el('salvaNovo').textContent = Estado.simulando ? 'Simular' : 'Salvar';

    if (prefill) {
        // copia tudo, inclusive data e valor: e' um ponto de partida, voce edita o que quiser
        el('fNome').value = prefill.nome || '';
        el('fCateg').value = prefill.categ || '';
        el('fData').value = dataISO(prefill.data) || '';
        el('fCred').checked = !!prefill.cred;
        const fatRef = prefill.fatura || prefill.fatura_id;
        atualizarFaturasDoFormulario(fatRef ? [fatRef] : []);
        el('fIsa').checked = !!prefill.isa;
        el('fPago').checked = prefill.pago !== false;   // so' desmarca se for explicitamente false
        el('fReservaEmergencia').checked = !!prefill.reserva;
        // so' herda a frequencia do original se ela for uma das regras conhecidas; senao
        // cai em "sem recorrencia" — lancamento antigo pode ter freq vazia ou um texto
        // livre qualquer, e atribuir isso a um <select> deixaria o campo em branco de
        // verdade (selectedIndex -1), sem opcao nenhuma marcada
        el('fFreq').value = RECORRENCIAS[prefill.freq] ? prefill.freq : '';
        const bruto = Math.abs(prefill.v || 0);
        if (bruto) {
            el('fValor').value = formataMascaraDinheiro(String(Math.round(bruto * 100)));
            sinalPositivo = (prefill.v || 0) > 0;
        }
    }
    else {
        el('fData').value = hojeISO();
        el('fFreq').value = '';   // avulso ate' que o Vezes diga o contrario (ver listener de #fParcelas)
        atualizarFaturasDoFormulario([]);
    }
    atualizaSinalUI();
    atualizaAvisoFronteira();
    sugereModoValorParcelas();

    modalNovo.showModal();
    // duplicando, o foco vai pro Valor (o que mais muda); do zero, vai pro Nome
    setTimeout(() => el(prefill ? 'fValor' : 'fNome').focus(), 50);
}
el('fDataHoje').onclick = () => {
    el('fData').value = hojeISO();
    atualizaAvisoFronteira();
};

// ===================================================================
// CALCULADORA (modal auxiliar do campo Valor)
// ===================================================================
// Avalia so o subconjunto de expressao aceito pelo visor (numeros, + - X / %,
// parenteses e virgula decimal) — nunca usa eval. O visor e' um <input> de verdade:
// aceita digitacao direta do teclado e clique/toque pra posicionar o cursor no meio
// da expressao (o proprio input cuida do caret — os botoes so inserem/apagam ali).
const modalCalc = el('modalCalc');
const calcInput = el('calcVisor');
const calcExprAtual = () => calcInput.value;

// insere um texto na posicao atual do cursor (substituindo a selecao, se houver) e
// deixa o cursor logo depois do que foi inserido — igual digitar de verdade
function calcInsere(texto) {
    const ini = calcInput.selectionStart ?? calcInput.value.length;
    const fim = calcInput.selectionEnd ?? calcInput.value.length;
    calcInput.setRangeText(texto, ini, fim, 'end');
    calcFormataMilharAoRedorDoCursor();
    calcRenderiza();
}
function calcApaga() {
    const ini = calcInput.selectionStart ?? calcInput.value.length;
    const fim = calcInput.selectionEnd ?? calcInput.value.length;
    if (ini == fim) { if (ini == 0) return; calcInput.setRangeText('', ini - 1, ini, 'end'); }
    else calcInput.setRangeText('', ini, fim, 'end');
    calcFormataMilharAoRedorDoCursor();
    calcRenderiza();
}

// re-formata SO' o numero onde o cursor esta (nunca a expressao inteira) com ponto de
// milhar automatico na parte inteira — ex: digitar 1234567 vira "1.234.567" sozinho — e
// so' poe virgula decimal quando o proprio usuario digita ela (nunca insere sozinha).
// O numero e' o trecho contiguo de digitos/pontos/virgula ao redor do cursor, delimitado
// por operador, parenteses ou borda da string (os outros numeros da expressao ficam
// intocados). O cursor e' reposicionado contando quantos DIGITOS reais (sem os pontos de
// milhar, que sao so' formatacao) havia antes dele, pra nao pular de lugar ao digitar.
function calcFormataMilharAoRedorDoCursor() {
    const valor = calcInput.value;
    const pos = calcInput.selectionStart ?? valor.length;
    const delimitador = /[+\-×÷()]/;

    let ini = pos; while (ini > 0 && !delimitador.test(valor[ini - 1])) ini--;
    let fim = pos; while (fim < valor.length && !delimitador.test(valor[fim])) fim++;

    const numero = valor.slice(ini, fim);
    if (!/\d/.test(numero)) return;   // nada de numero aqui (ex: cursor logo apos um operador)

    // quantos digitos reais (sem pontos de milhar) ficam antes do cursor, dentro do numero
    const digitosAntes = numero.slice(0, pos - ini).replace(/\./g, '').length;

    const [parteInteira, ...resto] = numero.split(',');
    const inteiraFormatada = parteInteira.replace(/\./g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const numeroFormatado = inteiraFormatada + (resto.length ? ',' + resto.join(',') : '');

    calcInput.value = valor.slice(0, ini) + numeroFormatado + valor.slice(fim);

    // recoloca o cursor apos os mesmos N digitos reais de antes, contando os pontos
    // de milhar que agora existem no caminho (eles nao contam como "digito andado")
    let novoPos = ini, digitosVistos = 0;
    while (digitosVistos < digitosAntes && novoPos < ini + numeroFormatado.length) {
        if (/\d/.test(calcInput.value[novoPos])) digitosVistos++;
        novoPos++;
    }
    calcInput.setSelectionRange(novoPos, novoPos);
}

// mostra, numa linha abaixo, o resultado parcial em tempo real (so quando a expressao
// ja tem pelo menos um operador — um numero solto nao precisa repetir embaixo)
function calcRenderiza() {
    const expr = calcExprAtual();
    const temOperador = /[+\-×÷%]/.test(expr.slice(1));   // ignora um '-' inicial (numero negativo)
    const resultado = expr && temOperador ? calcAvalia(expr) : null;
    el('calcResultado').innerHTML = resultado != null ? '= ' + brl(resultado).replace('R$', '').trim() : '&nbsp;';
}

// conta parenteses abertos ainda sem fechar (so na parte ANTES do cursor), pra "( )"
// saber qual dos dois inserir na posicao onde voce esta
function calcParensAbertosAte(pos) {
    let n = 0;
    for (const c of calcExprAtual().slice(0, pos)) { if (c == '(') n++; else if (c == ')') n--; }
    return n;
}

function calcTokeniza(expr) {
    return expr.match(/\d+\.?\d*|[+\-*/%()]/g) || [];
}

// shunting-yard simples: numeros, + - * /, parenteses e %. Regra do %: se vier
// seguido de outro numero/parenteses, e' "a% de b" (ex: 15%100 = 15); se fechar a
// expressao ou vier antes de um operador/fecha-parenteses, e' percentual do numero
// anterior sozinho (ex: 50%+10 = 0,5+10). Precisao de ponto flutuante corrigida no final.
function calcAvalia(expr) {
    // visor usa os simbolos matematicos de verdade (× ÷), ponto de milhar automatico
    // e virgula decimal — a avaliacao interna usa os operadores JS (* /) e ponto decimal.
    // ORDEM IMPORTA: primeiro tira os pontos de MILHAR (senao "1.234,56" viraria
    // "1.234.56" depois de trocar a virgula por ponto), so' depois troca ',' por '.'.
    const normalizada = expr.replace(/(\d)\.(?=\d{3}(\D|$))/g, '$1').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
    // O teclado da calculadora só insere estes símbolos, mas validar aqui também protege
    // colagem e chamadas indiretas: texto desconhecido nunca pode ser parcialmente aceito.
    if (/[^\d.\s+\-*/%()]/.test(normalizada)) return null;
    const tokens = calcTokeniza(normalizada);
    if (!tokens.length) return null;

    try {

    const precedencia = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const saida = [], operadores = [];
    const aplicaTopo = () => {
        const op = operadores.pop();
        const b = saida.pop(), a = saida.pop();
        if (a == null || b == null) throw Error('expressao invalida');
        saida.push(op == '+' ? a + b : op == '-' ? a - b : op == '*' ? a * b : (b == 0 ? NaN : a / b));
    };

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^\d/.test(t)) {
            saida.push(+t);
        } else if (t == '%') {
            const proximo = tokens[i + 1];
            if (proximo != null && proximo != ')' && !(proximo in precedencia)) {
                // "a% de b": consome o proximo numero/parenteses aqui mesmo, com prioridade maxima
                saida.push(saida.pop() / 100);
                operadores.push('*');
            } else {
                saida.push(saida.pop() / 100);   // percentual isolado do numero anterior
            }
        } else if (t == '(') {
            operadores.push(t);
        } else if (t == ')') {
            while (operadores.length && operadores.at(-1) != '(') aplicaTopo();
            operadores.pop();
        } else {
            while (operadores.length && operadores.at(-1) != '(' && precedencia[operadores.at(-1)] >= precedencia[t]) aplicaTopo();
            operadores.push(t);
        }
    }
        while (operadores.length) aplicaTopo();
        if (saida.length != 1 || !isFinite(saida[0])) return null;
        return Math.round(saida[0] * 100) / 100;
    } catch {
        // Durante a digitação é normal haver "2+" ou parênteses incompletos. A tela
        // precisa continuar responsiva e apenas não exibir resultado até completar.
        return null;
    }
}

function calcConfirma() {
    const resultado = calcAvalia(calcExprAtual());
    if (resultado == null) { el('calcResultado').textContent = 'Expressão inválida'; return; }
    const bruto = Math.abs(resultado);
    el('fValor').value = formataMascaraDinheiro(String(Math.round(bruto * 100)));
    sinalPositivo = resultado > 0;
    atualizaSinalUI();
    modalCalc.close();
}

function calcToque(tecla) {
    const pos = calcInput.selectionStart ?? calcInput.value.length;
    const anterior = calcExprAtual().slice(0, pos).slice(-1);
    const ehOperador = c => '+-×÷'.includes(c);

    if (tecla == 'ac') { calcInput.value = ''; calcRenderiza(); calcInput.focus(); return; }
    if (tecla == 'back') { calcApaga(); calcInput.focus(); return; }
    if (tecla == 'paren') {
        const podeFechar = calcParensAbertosAte(pos) > 0 && anterior && /[\d)%]/.test(anterior);
        calcInsere(podeFechar ? ')' : '(');
        calcInput.focus(); return;
    }
    if (tecla == 'pct') {
        if (anterior && /[\d)]/.test(anterior)) calcInsere('%');
        calcInput.focus(); return;
    }
    if (tecla == 'igual') { calcConfirma(); return; }

    const mapa = { div: '÷', mul: '×', sub: '-', add: '+', ponto: ',' };
    const chr = mapa[tecla] ?? tecla;   // digitos vem com o proprio valor em data-calc

    if (chr == ',') {
        const segmento = calcExprAtual().slice(0, pos).split(/[+\-×÷()]/).pop();
        if (segmento.includes(',')) { calcInput.focus(); return; }
        calcInsere((segmento ? '' : '0') + ',');
    } else if (ehOperador(chr)) {
        if (!calcExprAtual().slice(0, pos) && chr != '-') { calcInput.focus(); return; }
        if (ehOperador(anterior)) { calcApaga(); calcInsere(chr); }   // troca o operador repetido
        else calcInsere(chr);
    } else {
        calcInsere(chr);
    }
    calcInput.focus();
}

el('abreCalc').onclick = () => {
    calcInput.value = '';
    calcRenderiza();
    modalCalc.showModal();
    setTimeout(() => calcInput.focus(), 50);
};
el('fechaCalc').onclick = () => modalCalc.close();
modalCalc.addEventListener('click', e => { if (e.target == modalCalc) modalCalc.close(); });
// mousedown num botao tira o foco do input ANTES do click disparar, colapsando a
// selecao/cursor — por isso cada clique inseria sempre na posicao errada (ex: "1+1"
// virava "11+"). preventDefault aqui mantem o foco (e o cursor) no input o tempo todo.
document.querySelectorAll('#modalCalc [data-calc]').forEach(bt => {
    bt.addEventListener('mousedown', e => e.preventDefault());
    bt.addEventListener('click', () => calcToque(bt.dataset.calc));
});

// digitacao direta do teclado fisico: cada tecla reconhecida passa pelo MESMO
// calcToque() que os botoes usam (mesma logica de trocar operador repetido, virgula
// unica por numero, etc). Teclas de navegacao/edicao do proprio input (setas, Home,
// Backspace nativo, Ctrl+C/V) continuam funcionando normalmente.
const CALC_TECLA_DO_KEY = {
    '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
    '+': 'add', '-': 'sub', '*': 'mul', 'x': 'mul', 'X': 'mul', '/': 'div', '%': 'pct',
    '.': 'ponto', ',': 'ponto', '(': 'paren', ')': 'paren',
};
calcInput.addEventListener('keydown', e => {
    if (e.key == 'Enter') { e.preventDefault(); calcConfirma(); return; }
    if (e.key == 'Escape') { e.preventDefault(); modalCalc.close(); return; }
    if (e.key == 'Backspace') { e.preventDefault(); calcToque('back'); return; }
    if (['Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // deixa passar Ctrl+C/V/A etc
    const tecla = CALC_TECLA_DO_KEY[e.key];
    e.preventDefault();   // bloqueia qualquer caractere que nao seja um dos reconhecidos acima
    if (tecla) calcToque(tecla);
});
calcInput.addEventListener('click', calcRenderiza);
calcInput.addEventListener('keyup', calcRenderiza);

el('abreNovo').onclick = () => abreModalNovo();
el('fechaNovo').onclick = () => modalNovo.close();
el('salvaNovo').onclick = () => submeteNovoLancamento();
modalNovo.addEventListener('click', e => { if (e.target == modalNovo) modalNovo.close(); });

// ao fechar o modal (por qualquer via: X, clique fora, Esc, ou apos salvar), se ele foi
// aberto pelo "Duplicar", desmarca a linha que originou o duplicado — senao ela ficava
// selecionada na tabela depois de fechar, o que nao faz mais sentido.
modalNovo.addEventListener('close', () => {
    if (modalNovo.dataset.viaDuplicar) { Estado.selecionados.clear(); desenhar(); }
    delete modalNovo.dataset.viaDuplicar;
});

// A mesma posicao da barra tem duas acoes mutuamente exclusivas:
// - lancamento real: Duplicar abre o modal pre-preenchido;
// - Aporte sugerido/Resgate necessario: cria o ajuste real quando ainda nao existe um
//   Aporte/Resgate no ciclo; caso exista, consolida nele por UPDATE.
el('seldup').onclick = async () => {
    const chave = [...Estado.selecionados.keys()][0];
    if (chave && /^(sug|res):/.test(chave)) {
        const ajuste = linhaDaChaveSelecao(chave);
        if (!ajuste || (ajuste._sug == null && !ajuste._res) || el('seldup').disabled) return;

        el('seldup').disabled = true;
        el('seldup').textContent = 'Salvando…';
        try {
            const ehAporte = chave.startsWith('sug:');
            const data = dataISO(ajuste.data) || null;
            const valorAjuste = ajuste._sug != null ? ajuste._sug : ajuste.v;
            const existente = movimentoAporteOuResgateDoCiclo(indiceDoAjuste(chave));
            if (existente) {
                const consolidado = consolidarAjusteExistente(existente, valorAjuste);
                const linhaAtualizada = await atualizarLancamento(existente.id, {
                    nome: consolidado.nome,
                    valor: consolidado.valor,
                });
                Object.assign(existente, linhaAtualizada, {
                    v: +linhaAtualizada.valor || 0,
                    inv: /^investimento$/i.test(String(linhaAtualizada.categ || '').trim()),
                });
            } else {
                const linhaCriada = await inserirLancamento({
                    data,
                    freq: null,
                    cred: false,
                    isa: false,
                    pago: false,
                    ativo: true,
                    nome: ehAporte ? 'Aporte' : 'Resgate',
                    categ: ajuste.categ,
                    valor: valorAjuste,
                });
                const periodoIdx = data ? periodoDoDebito(data) : null;
                Estado.lancamentos.push({
                    ...linhaCriada,
                    v: +linhaCriada.valor || 0,
                    inv: /^investimento$/i.test(String(linhaCriada.categ || '').trim()),
                    periodoIdx: periodoIdx != null && periodoIdx >= 0 && periodoIdx < Estado.ciclos.length ? periodoIdx : null,
                });
            }
            Estado.selecionados.clear();
            desenhar();
        } catch (err) {
            mostrarToast('Falhou ao materializar o ajuste', err.message);
        } finally {
            el('seldup').disabled = false;
            const existente = /^(sug|res):/.test(chave) && movimentoAporteOuResgateDoCiclo(indiceDoAjuste(chave));
            el('seldup').textContent = /^(sug|res):/.test(chave)
                ? (existente ? 'Consolidar' : 'Materializar')
                : 'Duplicar';
        }
        return;
    }

    const r = Estado.lancamentos.find(x => String(x.id) == chave);
    if (r) { modalNovo.dataset.viaDuplicar = '1'; abreModalNovo(r); }
};

// excluir a linha selecionada, uma por vez. So' aparece com UMA linha real marcada (ver
// chaveUnicaReal em atualizaBarraSelecao) — linha sintetica (fatura, saldo, resgate) nao
// existe no banco e nao tem o que apagar. Pede confirmacao porque nao da' pra desfazer.
// Lancamento simulado (_sim) nunca foi salvo: sai so' do array em memoria, sem DELETE.
el('seldel').onclick = async () => {
    const chave = [...Estado.selecionados.keys()][0];
    const i = Estado.lancamentos.findIndex(x => String(x.id) == chave);
    if (i < 0) return;

    const r = Estado.lancamentos[i];
    if (!confirm(`Excluir "${r.nome ?? ''}" (${brl(r.v || 0)})?\n\nNão dá pra desfazer.`)) return;

    if (el('seldel').disabled) return;   // trava clique duplo enquanto o DELETE esta no ar
    el('seldel').disabled = true;
    el('seldel').textContent = 'Excluindo…';
    try {
        if (!r._sim) await excluirLancamento(r.id);
        Estado.lancamentos.splice(i, 1);
        Estado.selecionados.clear();
        desenhar();
    } catch (err) {
        mostrarToast('Falhou ao excluir', err.message);
    } finally {
        el('seldel').disabled = false;
        el('seldel').textContent = 'Excluir';
    }
};

// divide um valor total em N parcelas iguais, jogando o resto de arredondamento na
// ultima (ex: R$100 em 3x = 33,33 + 33,33 + 33,34) — a soma das parcelas nunca diverge
// do total digitado por causa de arredondamento.
function valorDasParcelas(valorTotal, parcelas) {
    const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;
    const somaAteAntepenultima = valorParcela * (parcelas - 1);
    const valorUltima = Math.round((valorTotal - somaAteAntepenultima) * 100) / 100;
    return Array.from({ length: parcelas }, (_, p) => p == parcelas - 1 ? valorUltima : valorParcela);
}

// ---- salvar: nao fecha o modal, so limpa valor/data e mostra confirmacao ----
// MESMO formulario serve pros dois destinos — a chave e' Estado.simulando (o toggle
// global no topo): ligado, as parcelas viram lancamentos _sim=true SO' na memoria
// (nunca chamam inserirLancamento, nunca tocam o Supabase — ver o bloco MODO SIMULACAO
// mais abaixo); desligado, cada parcela e' um POST real, sequencial, uma fatura depois
// da outra. "Dividir valor" (independente de Credito/Debito) escolhe se o campo "Vezes"
// DIVIDE o valor digitado entre as N linhas (valorDasParcelas, ex: R$300 em 3x = R$100
// cada) ou REPETE o mesmo valor em cada uma (ex: R$50 3x = R$50 + R$50 + R$50) — pensado
// pra lancar de uma vez uma conta recorrente de valor fixo (ex: assinatura, mensalidade)
// que ainda nao foi cadastrada.
async function submeteNovoLancamento() {
    el('erroNovo').textContent = ''; el('erroNovo').classList.remove('ok');

    const nome = el('fNome').value.trim();
    if (!nome) { el('erroNovo').textContent = 'Preencha o nome.'; el('fNome').focus(); return; }
    const categ = el('fCateg').value || null;
    if (!categ) { el('erroNovo').textContent = 'Escolha uma categoria.'; el('fCateg').focus(); return; }

    const data = el('fData').value || null;
    const valorDigitado = el('fValor').value.trim();
    const valorTotal = valorDigitado ? valorMascaraParaNumero(valorDigitado) : 0;

    const cred = el('fCred').checked;
    const ehAntecip = ehAntecipacaoFatura(categ || '');
    // credito sempre exige fatura; antecipacao de debito tambem (agora com vinculo explicito)
    const faturaIds = (cred || ehAntecip) ? idsFaturasDoFormulario() : [];
    const isa = el('fIsa').checked;
    const pago = el('fPago').checked;
    const reservaEmergencia = el('fReservaEmergencia').checked;
    const freq = el('fFreq').value || null;   // "" (sem recorrencia) vira null, pra coluna freq ficar vazia no banco
    // valor em branco: cadastro sempre foi permitido assim (lancamento sem valor definido
    // ainda, ex: assinatura de preco variavel). Sem valor nao ha o que dividir nem repetir,
    // entao o campo Vezes/Dividir fica sem efeito — 1 unica linha com valor null, igual
    // sempre foi.
    const parcelas = valorTotal ? +el('fParcelas').value : 1;
    const dividir = el('fDivide').checked;
    const valorAssinado = valorTotal * (sinalPositivo ? 1 : -1);
    const valores = !valorTotal ? [null]
        : dividir ? valorDasParcelas(valorTotal, parcelas).map(v => v * (sinalPositivo ? 1 : -1))
            : Array(parcelas).fill(valorAssinado);   // repete o mesmo valor digitado em cada linha, sem dividir

    if ((cred || ehAntecip) && (faturaIds.length !== parcelas || faturaIds.some(id => !id))) {
        el('erroNovo').textContent = cred
            ? 'Escolha uma fatura para cada parcela de crédito.'
            : 'Escolha a fatura que esta antecipação está quitando.';
        el('fFaturasWrap').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
    }

    if (el('salvaNovo').disabled) return;   // trava clique duplo / Enter repetido
    el('salvaNovo').disabled = true;
    el('salvaNovo').textContent = Estado.simulando ? 'Simulando…' : 'Salvando…';

    try {
        if (Estado.simulando) simulaLancamentoParcelado({ nome, categ, freq, data, cred, isa, pago, reservaEmergencia, parcelas, valores, faturaIds });
        else await salvaLancamentoParceladoNoBanco({ nome, categ, freq, data, cred, isa, pago, reservaEmergencia, parcelas, valores, faturaIds });

        // sucesso: NAO fecha o modal. Limpa so valor/data, mantem nome/categoria/cred/isa
        // pro proximo lancamento da mesma sessao (ex: varios itens do mesmo mercado).
        const totalAssinado = valores.reduce((s, v) => s + v, 0);
        el('erroNovo').textContent = (Estado.simulando ? 'Simulado: ' : 'Salvo: ') +
            (parcelas > 1 ? `${parcelas}x ${brl(Math.abs(valores[0]))} · ${brl(Math.abs(totalAssinado))} no total` : brl(totalAssinado));
        el('erroNovo').classList.add('ok');
        el('fNome').value = '';
        el('fValor').value = ''; sinalPositivo = false; atualizaSinalUI();
        el('fData').value = hojeISO();
        el('fReservaEmergencia').checked = false;
        el('fCateg').selectedIndex = 0;   // categoria vinha do nome; sem nome, nao faz sentido manter
        atualizaAvisoFronteira();
        popularCategoriasNoForm();   // recalcula popularidade com o lancamento recem-criado
        desenhar();
        el('fNome').focus();
    } catch (err) {
        el('erroNovo').textContent = 'Falhou ao salvar: ' + err.message;
    } finally {
        el('salvaNovo').disabled = false;
        el('salvaNovo').textContent = Estado.simulando ? 'Simular' : 'Salvar';
    }
}

// grava as N parcelas como lancamentos REAIS no Supabase, uma por vez (sequencial, pra
// preservar a ordem e simplificar o tratamento de erro no meio do caminho). Cada parcela
// p grava sua PROPRIA data (a data digitada avancada p vezes pela regra da Frequencia
// escolhida — ver dataDaOcorrencia) — nao so' a mesma data repetida — porque o
// periodoIdx nao e' uma coluna do banco: ele e' recalculado do
// zero a partir da 'data' toda vez que os dados sao carregados (ver carregarDados). Se
// todas as parcelas fossem gravadas com a mesma data, o recalculo jogava todas de volta
// pro mesmo mes ao dar F5/recarregar, mesmo com o periodoIdx correto (e passageiro) na
// memoria logo apos o cadastro. Por isso o periodoIdx de cada parcela aqui usa a MESMA
// regra de classificacao que carregarDados() usa: debito pela propria data, credito pelo
// vencimento da fatura escolhida. Assim o que aparece na hora e' igual ao recarregamento.
async function salvaLancamentoParceladoNoBanco({ nome, categ, freq, data, cred, isa, pago, reservaEmergencia, parcelas, valores, faturaIds = [] }) {
    const ehAntecip = ehAntecipacaoFatura(categ || '');
    for (let p = 0; p < parcelas; p++) {
        const dataParcela = data ? dataDaOcorrencia(data, p, freq) : null;
        const faturaVenc = (cred || ehAntecip) && faturaIds[p] ? dataISO(faturaIds[p]) : null;
        const payload = {
            data: dataParcela, freq, cred, isa, pago, reserva: reservaEmergencia, ativo: true,
            nome,
            categ, valor: valores[p],
            fatura: faturaVenc,
        };
        const linhaCriada = await inserirLancamento(payload);
        const periodoIdx = !dataParcela ? null
            // antecipacao e' debito: periodo determinado pela propria data, nao pelo vencimento da fatura
            : cred ? periodoDaFatura(faturaVenc) : periodoDoDebito(dataISO(dataParcela));
        const idxValido = periodoIdx != null && periodoIdx >= 0 && periodoIdx < Estado.ciclos.length ? periodoIdx : null;
        Estado.lancamentos.push({
            ...linhaCriada,
            v: +linhaCriada.valor || 0,
            inv: /^investimento$/i.test(String(linhaCriada.categ || '').trim()),
            periodoIdx: idxValido,
        });
    }
}


// ===================================================================
// MODO SIMULAÇÃO — lancamentos hipoteticos injetados DIRETO em Estado.lancamentos,
// marcados com _sim=true. Nunca tocam o banco (nao passam por inserirLancamento):
// desligar o modo ou recarregar dados (load() reconstroi Estado.lancamentos do zero a
// partir do Supabase) apaga tudo sozinho, de graca — nao precisa filtrar nada em lugar
// nenhum do resto do app pra "esconder" a simulacao, ela simplesmente deixa de existir.
// Enquanto ativo, os simulados entram em TODAS as metricas (saldo, matriz Comparar,
// graficos) exatamente como um lancamento real entraria, porque sao um.
//
// O formulario de lancamento e' o MESMO de sempre (modalNovo/#abreNovo) — nao ha mais um
// modal "Simular compra" separado. Enquanto o toggle abaixo estiver ligado,
// submeteNovoLancamento() desvia pra simulaLancamentoParcelado() em vez de gravar no
// banco (ver abreModalNovo, que tambem troca titulo/texto do botao conforme o modo).
// ===================================================================
function atualizaBotaoSimulacao() {
    el('toggleSimulacao').classList.toggle('ativo', Estado.simulando);
    el('toggleSimulacao').title = Estado.simulando
        ? 'Simulação ativa'
        : 'Simular (não salva)';
    document.body.classList.toggle('simulando', Estado.simulando);
}

el('toggleSimulacao').onclick = async () => {
    if (Estado.simulando) {
        // desligar = descartar: recarrega os dados de verdade do banco, que reconstroi
        // Estado.lancamentos do zero SEM os simulados (eles nunca foram salvos)
        Estado.simulando = false;
        atualizaBotaoSimulacao();
        await load();
    } else {
        Estado.simulando = true;
        atualizaBotaoSimulacao();
        desenhar();
    }
};

// cria N lancamentos simulados (parcelas), um por periodo seguinte, injetados direto em
// Estado.lancamentos com _sim=true. Cada parcela p ganha sua PROPRIA data (a digitada
// avancada p vezes pela regra da Frequencia, via dataDaOcorrencia — mesma ideia de
// salvaLancamentoParceladoNoBanco) e o periodoIdx e'
// derivado dessa data com a MESMA regra de qualquer lancamento real, em vez de so' somar
// +1 no indice: sem isso a coluna Data mostrava a mesma data em todas as parcelas
// enquanto elas apareciam espalhadas em ciclos diferentes, incoerente na tela.
function simulaLancamentoParcelado({ nome, categ, freq, data, cred, isa, pago, reservaEmergencia, parcelas, valores, faturaIds = [] }) {
    const grupoSimulado = ++Estado._proxIdSimulado;   // contador curto, so' pra diferenciar cada "compra simulada" das outras
    const ehAntecip = ehAntecipacaoFatura(categ || '');

    const criadas = valores.map((valorAssinado, p) => {
        const dataParcela = data ? dataDaOcorrencia(data, p, freq) : null;
        const faturaVenc = (cred || ehAntecip) && faturaIds[p] ? dataISO(faturaIds[p]) : null;
        const periodoIdx = !dataParcela ? null
            : cred ? periodoDaFatura(faturaVenc) : periodoDoDebito(dataISO(dataParcela));
        return {
            id: `sim-${grupoSimulado}-${p}`,
            nome,
            categ, freq, data: dataParcela,
            cred, isa, pago, reserva: reservaEmergencia, ativo: true,
            fatura: faturaVenc,
            valor: valorAssinado, v: +valorAssinado || 0,   // v numerico seguro, igual carregarDados() faz com dados reais
            inv: /^investimento$/i.test(categ.trim()),
            periodoIdx: periodoIdx != null && periodoIdx >= 0 && periodoIdx < Estado.ciclos.length ? periodoIdx : null,
            _sim: true,
        };
    });
    Estado.lancamentos.push(...criadas);
}

// ===================================================================
// LOGIN (Supabase Auth)
// ===================================================================
