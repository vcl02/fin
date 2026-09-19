const API = 'https://yzmyncxoskvqzdczaill.supabase.co', KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
const EMAIL_ISABELLA = 'isabella.251200@gmail.com';   // login que recebe a visao restrita

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SALDO_INICIAL = 0;
const SALDO_DESDE = '2026-08-07';
const COLS = [
    ['data', 'Data', 'd'], ['nome', 'Nome', 't'], ['valor', 'Valor', 'n'],
    ['categ', 'Categoria', 't'], ['freq', 'Frequência', 't'], ['pago', 'Pago', 'b'],
    ['id', 'ID', 'n'],
];
const COLS_MOBILE = [['data', 'Data', 'd'], ['nome', 'Nome', 't'], ['valor', 'Valor', 'n']];
const isMobile = () => matchMedia('(max-width: 640px)').matches;
const colunasAtivas = () => isMobile() ? COLS_MOBILE : COLS;

const Estado = {
    ciclos: [],                // ciclos efemeros derivados exclusivamente de Faturamento PJ
    faturas: [],               // faturas DB-first; cada credito novo aponta manualmente para uma delas
    lancamentos: [],           // linhas da tabela 'lancamentos', ja com 'v' (numero) e 'periodoIdx'
    valorFaturaPorCiclo: {},   // chave 'fat:<indice>' -> total da fatura daquele periodo (usado na selecao)
    selecionados: new Map(),   // chave de selecao -> valor da linha (soma da barra flutuante)
    ordenacaoPorTabela: {},    // id da tabela -> { k: coluna, d: direcao (1 asc, 2 desc) }
    filtroTexto: {},           // id da tabela -> { coluna: texto digitado } (filtro tipo DataGrip)
    linhasVisiveis: {},        // id da tabela -> array de linhas atualmente na tela (apos filtro de texto)
    fechados: {},
    restrito: false,           // true quando quem esta logado e o perfil restrito (Isabella)
    ordComp: { k: 'total', d: 2 },
    simulando: false,          // modo simulacao: lancamentos com _sim=true injetados so' em memoria, nunca vao pro banco
    _proxIdSimulado: 0,        // contador curto pra gerar ids "sim-N-parcela" (em vez de Date.now(), que fica gigante e ilegivel)
};

const modoSimples = () => Estado.restrito || matchMedia('(max-width: 640px)').matches;

const estadoOrdenacao = id => Estado.ordenacaoPorTabela[id] || (Estado.ordenacaoPorTabela[id] = { k: 'data', d: 1 });
const estadoFiltroTexto = id => Estado.filtroTexto[id] || (Estado.filtroTexto[id] = {});

// HELPERS
const el = id => document.getElementById(id);
// mostra/esconde um campo da barra de filtros com fade suave, em vez do corte seco do
// atributo hidden. Ao aparecer: tira o hidden e roda o fadeIn. Ao sumir: roda o fadeOut
// e SO' entao aplica hidden (fora do fluxo, sem deixar buraco) quando a animacao termina —
// nao antes, senao o hidden corta a transicao no meio.
// Duas redes de seguranca contra o campo ficar preso visivel pra sempre:
//  1) se for chamada de novo antes do fadeOut anterior terminar (troca rapida de visao,
//     ida e volta), o timer/listener pendentes sao cancelados aqui e reagendados do zero;
//  2) um setTimeout um pouco mais longo que a animacao aplica hidden=true de qualquer
//     jeito, caso o evento 'animationend' nunca dispare (prefers-reduced-motion desativa
//     a animacao sem disparar o evento, aba em background, etc) — sem essa rede, o campo
//     fica visivel escondido atras do 'return' de jaResolvidoAssim pra sempre.
function mostraComFade(id, mostrar) {
    const alvo = el(id);
    if (alvo._fadeOutHandler) { alvo.removeEventListener('animationend', alvo._fadeOutHandler); alvo._fadeOutHandler = null; }
    if (alvo._fadeOutTimer) { clearTimeout(alvo._fadeOutTimer); alvo._fadeOutTimer = null; }
    // "definitivamente visivel" = sem hidden e sem estar no meio de um fadeOut (que ainda
    // vai acabar escondendo). So pula o trabalho se o estado final ja bate com o pedido.
    const jaResolvidoAssim = mostrar ? (!alvo.hidden && !alvo.classList.contains('fadeOut')) : alvo.hidden;
    if (jaResolvidoAssim) return;
    alvo.classList.remove('fadeIn', 'fadeOut');
    if (mostrar) {
        alvo.hidden = false;
        void alvo.offsetWidth;   // forca reflow pra garantir que a animacao rode desde o inicio
        alvo.classList.add('fadeIn');
    } else {
        alvo.classList.add('fadeOut');
        const termina = () => {
            alvo.hidden = true;
            alvo.classList.remove('fadeOut');
            if (alvo._fadeOutHandler) { alvo.removeEventListener('animationend', alvo._fadeOutHandler); alvo._fadeOutHandler = null; }
            if (alvo._fadeOutTimer) { clearTimeout(alvo._fadeOutTimer); alvo._fadeOutTimer = null; }
        };
        alvo._fadeOutHandler = termina;
        alvo.addEventListener('animationend', termina, { once: true });
        alvo._fadeOutTimer = setTimeout(termina, 250);   // duracao do fadeOut (.18s) + folga
    }
}
const brl = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const corValor = v => v < 0 ? 'vm' : v > 0 ? 'vd' : '';                                     // classe css: vermelho/verde conforme o sinal
const celValor = v => `<td class="n ${corValor(v)}">${brl(v)}`;                             // celula <td> ja formatada em R$
// mesma celValor, mas clicavel pra edicao inline — so' pra lancamentos REAIS (id numerico
// vindo do banco; linhas sinteticas tem id negativo fixo -1..-6, e simuladas tem id tipo
// "sim-N-P", nenhum dos dois casos existe na tabela lancamentos pra dar PATCH).
const celValorEditavel = r => `<td class="n ${corValor(r.v)}"><span class="togValor" data-tog-valor="${escapeHtml(String(r.id))}" title="Clique pra editar o valor">${brl(r.v)}</span>`;

// Zona morta pra SOMAS/TOTAIS (nunca pra valor de lancamento individual): entre -R$50 e +R$50 (inclusive) fica cinza,
// porque uma diferenca tao pequena nao muda decisao nenhuma — so pinta vermelho/verde quando o total realmente sai desse intervalo.
const corSoma = v => (v >= -50 && v <= 50) ? '' : corValor(v);
const celSoma = v => `<td class="n ${corSoma(v)}">${brl(v)}`;
const dataISO = s => String(s || '').slice(0, 10);                                                              // normaliza pra 'YYYY-MM-DD'
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);   // hoje em 'YYYY-MM-DD' no fuso local (toISOString sozinho usa UTC e erra o dia a noite)
const timestamp = s => Date.parse(dataISO(s)) || 0;                                                             // YYYY-MM-DD -> numero, pra comparar/ordenar
const dataBR = s => { const p = dataISO(s).split('-'); return p.length == 3 ? `${p[2]}/${p[1]}/${p[0]}` : s };  // YYYY-MM-DD -> DD/MM/YYYY
// tolerancia da busca por Valor: +/- 5 centavos do que foi digitado, pra achar mesmo sem
// bater centavo a centavo (ex: buscar "150" acha 149,97 a 150,03)
const TOLERANCIA_BUSCA_VALOR = 0.05;
const capitaliza = s => String(s ?? '').replace(/^./, c => c.toUpperCase());
// nome de exibicao de uma coluna do lancamento ('nome'/'categ') — normaliza 'categ' pra
// "Categoria" (capitaliza() sozinho faria "Categ") em todo lugar que rotula essa coluna:
// combo "Agrupar por", cabecalho da matriz Comparar e o subtitulo dela.
const nomeColuna = c => c == 'categ' ? 'Categoria' : capitaliza(c);
const semAcento = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');   // escapa aspas/&/<> pra nao quebrar o HTML se algum valor do banco tiver esses caracteres

// filtra valores vazios de verdade (null/undefined/"") E variacoes textuais de "vazio" que podem ter ficado salvas no banco por engano: "null", "<null>", "undefined", "n/a" etc.
const valorValido = v => {
    if (!v) return false;
    const limpo = String(v).trim().toLowerCase().replace(/^<|>$/g, '');
    return !['null', 'undefined', 'nan', 'none', 'n/a'].includes(limpo);
};

// categoria dedicada pra antecipacao de fatura: um debito nessa categoria abate o quanto ainda falta sair da conta na linha dinamica "Fatura do cartao" (nao duplica o lancamento — ele continua aparecendo normal na tabela de Debito).
const ehAntecipacaoFatura = categ => {
    const c = semAcento(categ).trim();
    return c.includes('antecipacao') && c.includes('fatura');
};

// Antecipacao e' TRANSFERENCIA, nao gasto: a despesa ja foi contada na compra do credito. Entra no fluxo de caixa (bloco Debito) e fica fora das analises de gasto (Comparar, Balanco, evolucao, pizza) — senao a mesma despesa conta duas vezes.
const ehTransferenciaFatura = r => !r.cred && ehAntecipacaoFatura(r.categ);

// Data a partir da qual voce passou a lancar os pagamentos de fatura. Faturas que venceram antes disso foram pagas sem lancamento, entao tem saldo "fantasma" e engoliriam as antecipacoes novas. AJUSTE aqui quando comecar a lancar. proximo dia (usado pra calcular o inicio de um periodo a partir do 'fat' do anterior)
function proximoDia(iso) {
    const d = new Date(dataISO(iso) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

// Soma N meses a uma data ISO, preservando o dia (com clamp pro ultimo dia do mes de
// destino quando ele nao existe — 31/01 + 1 mes = 28 ou 29/02, nunca "03/03" por
// transbordo). Usada pra datar cada PARCELA de uma compra parcelada: parcela 2 cai ~1
// mes depois da 1a, parcela 3 ~2 meses depois etc — igual uma fatura de cartao de
// verdade, onde cada parcela e' cobrada no ciclo seguinte. Sem isso, todas as parcelas
// ficavam gravadas com a MESMA data no banco; o periodoIdx certo so' existia em memoria
// (calculado na hora do cadastro) e sumia ao recarregar, porque o recalculo (carregarDados)
// deriva o periodo so' a partir da 'data' — e' o que fazia as parcelas desmoronarem todas
// pro mesmo mes depois de dar F5/limpar cache.
function somaMeses(iso, n) {
    if (!n) return dataISO(iso);
    const [y, m, d] = dataISO(iso).split('-').map(Number);
    const alvo = new Date(Date.UTC(y, m - 1 + n, 1));                    // 1o dia do mes de destino
    const ultimoDiaAlvo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    alvo.setUTCDate(Math.min(d, ultimoDiaAlvo));
    return alvo.toISOString().slice(0, 10);
}

// Soma N dias corridos a uma data ISO (mesmo padrao UTC de proximoDia/menos30, so' que
// com passo livre) — base das recorrencias que andam por semana, nao por mes.
function somaDias(iso, n) {
    if (!n) return dataISO(iso);
    const d = new Date(dataISO(iso) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

// As opcoes do campo Frequencia, e a REGRA de cada uma: como andar da 1a ocorrencia pra
// proxima quando o lancamento e' repetido/parcelado em N vezes.
//  - 'mes' anda de mes em mes preservando o DIA (via somaMeses, ja com clamp: dia 31 cai
//    no ultimo dia do mes curto, e 29/02 vira 28/02 em ano nao bissexto);
//  - 'dia' anda em dias corridos, o que mantem o MESMO DIA DA SEMANA (7 e 14 sao multiplos
//    de 7) sem depender de calendario.
// A chave e' exatamente o texto gravado na coluna 'freq' do banco — o <option value> no
// index.html usa esses mesmos nomes, entao ler o select ja da' a regra direto.
const RECORRENCIAS = {
    Mensal: { tipo: 'mes', passo: 1 },
    Semanal: { tipo: 'dia', passo: 7 },
    Quinzenal: { tipo: 'dia', passo: 14 },   // "quinze" e' so' o nome de costume — a regra e' de 2 em 2 semanas, nao 15 dias
    Semestral: { tipo: 'mes', passo: 6 },
    Anual: { tipo: 'mes', passo: 12 },       // +12 meses = mesmo dia, ano seguinte
};

// Data da p-esima ocorrencia (p=0 e' a 1a, que cai na propria data digitada) conforme a
// Frequencia escolhida. Frequencia vazia ("sem recorrencia") ou desconhecida cai em
// Mensal: com 1x so' isso nao muda nada (p=0 devolve a propria data), e a partir de 2x
// PRECISA haver algum espacamento — sem regra as N linhas nasceriam todas na mesma data,
// que e' exatamente o bug que fazia as parcelas desabarem no mesmo mes ao recarregar.
// Mensal e' tambem o unico comportamento que existia antes deste campo virar regra.
function dataDaOcorrencia(iso, p, freq) {
    const regra = RECORRENCIAS[freq] || RECORRENCIAS.Mensal;
    const passo = regra.passo * p;
    return regra.tipo == 'dia' ? somaDias(iso, passo) : somaMeses(iso, passo);
}

// Nome de exibicao de um periodo: sempre o MES ANTERIOR ao seu 'fat'. Ex.: periodo com fat=2026-07-06 se chama "Junho 2026" (o mes em que ele comecou).
function nomePeriodo(fatStr) {
    const iso = dataISO(fatStr), y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    let mesAnterior = m - 1, ano = y;
    if (mesAnterior == 0) { mesAnterior = 12; ano--; }   // janeiro -> volta pra dezembro do ano anterior
    return `${MESES[mesAnterior - 1]} ${ano}`;
}

// Mesma logica de nomePeriodo, mas abreviada ("Set/26") — usada no titulo da visao Comparar.
function nomePeriodoAbrev(fatStr) {
    const iso = dataISO(fatStr), y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    let mesAnterior = m - 1, ano = y;
    if (mesAnterior == 0) { mesAnterior = 12; ano--; }
    return `${MESES[mesAnterior - 1].slice(0, 3)}/${String(ano).slice(-2)}`;
}

// So' o nome do mes (sem ano) de um periodo — usado nas colunas "Somente <mes>" da
// comparacao 1-a-1 entre 2 periodos.
function nomeMesPeriodo(fatStr) {
    const iso = dataISO(fatStr), m = +iso.slice(5, 7);
    let mesAnterior = m - 1;
    if (mesAnterior == 0) mesAnterior = 12;
    return MESES[mesAnterior - 1];
}

// Credito nao e' classificado pela data da compra: a fatura foi escolhida manualmente
// e o vencimento dela determina em qual ciclo de caixa o total aparece.
function periodoDaFatura(faturaId) {
    const fatura = Estado.faturas.find(f => String(f.id) === String(faturaId));
    return fatura ? periodoDoDebito(dataISO(fatura.vencimento)) : null;
}

function vencimentoDoCiclo(idx) {
    const faturas = Estado.faturas
        .filter(f => periodoDaFatura(f.id) === idx)
        .sort((a, b) => timestamp(a.vencimento) - timestamp(b.vencimento));
    return faturas[0] ? dataISO(faturas[0].vencimento) : dataISO(Estado.ciclos[idx]?.fat);
}

function tituloFaturaDoCiclo(idx) {
    const fatura = Estado.faturas
        .filter(f => periodoDaFatura(f.id) === idx)
        .sort((a, b) => timestamp(a.vencimento) - timestamp(b.vencimento))[0];
    return fatura ? nomeFatura(fatura) : '�';
}

// Distribui as antecipacoes do unico cartao detalhado pelas faturas, da mais antiga pra
// mais nova. A fatura da Isabella e' um lancamento comum e nao participa deste calculo.
// Antecipacoes com fatura_id explicito vao direto para a fatura apontada (sem depender de
// ordenacao cronologica). Antecipacoes antigas sem fatura_id continuam usando o fallback
// cronologico (ponteiro p na lista de faturas com saldo).
function alocacaoAntecipacoes(linhas) {
    // saldo devido de cada fatura, na ordem em que aparecem na tela.
    // faturaId e' o id do banco (para cruzar com r.fatura_id das antecipacoes novas).
    const faturas = [];
    Estado.ciclos.forEach((per, idx) => {
        const bruto = linhas
            .filter(r => r.cred && r.periodoIdx === idx)
            .reduce((s, r) => s + r.v, 0);
        if (bruto < 0) {
            // descobre qual fatura do banco corresponde a este ciclo (pode ser null se nao houver)
            const faturasDoCiclo = Estado.faturas.filter(f => periodoDaFatura(f.id) === idx);
            const faturaId = faturasDoCiclo.length === 1 ? faturasDoCiclo[0].id : null;
            faturas.push({ idx, saldo: -bruto, faturaId });
        }
    });

    const antecipacoes = linhas
        .filter(r => ehTransferenciaFatura(r) && r.data && r.v < 0)
        .sort((a, b) => timestamp(a.data) - timestamp(b.data));

    const abatido = {};
    let p = 0;                                                  // ponteiro no fallback cronologico
    antecipacoes.forEach(r => {
        if (r.fatura_id) {
            // vinculo explicito: abate direto na fatura apontada, independente de ordem
            const f = faturas.find(x => x.faturaId != null && String(x.faturaId) === String(r.fatura_id));
            if (f) {
                const usa = Math.min(-r.v, f.saldo);
                f.saldo -= usa;
                abatido[f.idx] = (abatido[f.idx] || 0) + usa;
            }
        } else {
            // fallback cronologico: comportamento anterior para antecipacoes sem fatura_id
            let resto = -r.v;
            while (resto > 0.005 && p < faturas.length) {
                const f = faturas[p];
                const usa = Math.min(resto, f.saldo);
                f.saldo -= usa; resto -= usa;
                abatido[f.idx] = (abatido[f.idx] || 0) + usa;
                if (f.saldo <= 0.005) p++;                              // fatura quitada: proxima antecipacao vai pra seguinte
                else break;                                                 // sobrou saldo: nada transborda
            }
            // resto que sobrar depois da ultima fatura conhecida simplesmente nao abate nada
        }
    });
    return abatido;
}

// Em qual PERIODO uma movimentacao de DEBITO cai: o periodo cujo intervalo [ini, fat] contem a data. Retorna null se a data for vazia (Backlog) ou nao cair em nenhum periodo cadastrado.
function periodoDoDebito(iso) {
    if (!iso) return null;
    return Estado.ciclos.findIndex(per => iso >= per.ini && iso <= dataISO(per.fat));
}

// CARGA DE DADOS — busca no Supabase e processa (sem tocar na tela)

// pega o token da sessao NA HORA: o supabase-js renova sozinho em background, entao guardar o token do login numa variavel garante 401 depois de ~1h. Se nao ha sessao, cai na chave publica (modo dev).
const tokenAtual = async (forcar) => {
    if (forcar) await sb.auth.refreshSession();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token || KEY;
};

const buscar = async (tabela, retry) => {
    const r = await fetch(`${API}/rest/v1/${tabela}?select=*&limit=100000`, { headers: { apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(retry) } });
    // 401 costuma ser token expirado ou relogio dessincronizado: renova e tenta uma vez
    if (r.status === 401 && !retry) return buscar(tabela, true);
    if (!r.ok) throw Error(`${tabela}: ${r.status} ${await r.text()}`);
    return r.json();
};

const inserirLancamento = async payload => {
    const r = await fetch(`${API}/rest/v1/lancamentos`, {
        method: 'POST',
        headers: {
            apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(),
            'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
    });
    if (!r.ok) throw Error(`inserir: ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    return linhas[0];
};

const excluirLancamento = async id => {
    const r = await fetch(`${API}/rest/v1/lancamentos?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
            apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(),
            Prefer: 'return=representation',
        },
    });
    if (!r.ok) throw Error(`excluir: ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    // com RLS sem policy de DELETE pra essa linha, o Postgrest devolve 200 OK e 0 linhas
    // apagadas (nao e' erro HTTP) — mesma armadilha do atualizarLancamento (UPDATE).
    if (!linhas.length) throw Error('nenhuma linha excluída (RLS/policy do Supabase pode estar bloqueando DELETE)');
};

const atualizarLancamento = async (id, campos) => {
    const r = await fetch(`${API}/rest/v1/lancamentos?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
            apikey: KEY, Authorization: 'Bearer ' + await tokenAtual(),
            'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify(campos),
    });
    if (!r.ok) throw Error(`atualizar: ${r.status} ${await r.text()}`);
    const linhas = await r.json();
    // com RLS sem policy de UPDATE pra essa linha, o Postgrest devolve 200 OK e 0 linhas
    // afetadas (nao e' erro HTTP) — sem essa checagem, o app "achava" que salvou e so'
    // o redraw local mudava, enquanto o banco continuava intocado.
    if (!linhas.length) throw Error('nenhuma linha atualizada (RLS/policy do Supabase pode estar bloqueando UPDATE)');
    return linhas[0];
};

// Busca faturas + lancamentos. Os ciclos sao derivados somente das datas reais de
// "Faturamento PJ"; nenhuma data de fechamento ou calendario projetado e' lida do banco.
async function carregarDados() {
    const [lancamentosCrus, faturasCrus] = await Promise.all([
        buscar('lancamentos'),
        buscar('faturas'),
    ]);

    Estado.faturas = faturasCrus.sort((a, b) => timestamp(a.vencimento) - timestamp(b.vencimento));

    const ancoras = lancamentosCrus
        .filter(r => !r.cred && String(r.nome || '').trim() === 'Faturamento PJ' && r.data)
        .sort((a, b) => timestamp(a.data) - timestamp(b.data));
    Estado.ciclos = ancoras.map((ancora, i) => ({
        id: `pj:${ancora.id}`,
        ini: dataISO(ancora.data),
        // O ultimo ciclo fica deliberadamente aberto ate' existir o proximo faturamento.
        fat: ancoras[i + 1] ? somaDias(dataISO(ancoras[i + 1].data), -1) : '9999-12-31',
    }));

    // classifica cada lancamento na sua competencia (periodoIdx)
    Estado.lancamentos = lancamentosCrus.map(r => {
        let periodoIdx;
        if (!r.data)
            periodoIdx = null;                                      // sem data -> Backlog, sempre
        else if (r.cred)
            periodoIdx = periodoDaFatura(r.fatura_id);
        else
            periodoIdx = periodoDoDebito(dataISO(r.data));          // debito segue o intervalo do periodo
        return {
            ...r,
            v: +r.valor || 0,                                                    // valor numerico seguro
            inv: /^investimento$/i.test(String(r.categ || '').trim()),           // e da categoria Investimento?
            periodoIdx: periodoIdx != null && periodoIdx >= 0 && periodoIdx < Estado.ciclos.length ? periodoIdx : null,
        };
    });

    return { lancamentosCrus, faturasCrus };
}

// ATUALIZAÇÃO DE UI — popula os <select> a partir do Estado já carregado

// Monta o combo de periodos (so os que tem algum lancamento, mais o periodo atual mesmo se vazio) e o combo "Agrupar por" (colunas disponiveis pra visao Comparar).
function atualizarCombos(lancamentosCrus) {
    const selecaoAnterior = el('ciclo').value;
    const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const idxAtual = Estado.ciclos.findIndex(per => hoje >= per.ini && hoje <= dataISO(per.fat));
    const usados = [...new Set(Estado.lancamentos.map(r => r.periodoIdx).filter(p => p != null))];

    if (idxAtual >= 0 && !usados.includes(idxAtual)) usados.push(idxAtual);
    usados.sort((a, b) => a - b);
    const opcoesCiclo = '<option value=-1>Backlog' + usados.map(i => `<option value=${i}>${nomePeriodo(Estado.ciclos[i].fat)}`).join('');
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

    // combos De/Até: a Isabella (perfil restrito) fica presa aos tres ciclos em volta de
    // hoje (anterior, atual, proximo — mesma janela de antes do navegador ‹›Atual), sem
    // Backlog; o resto ve todos os periodos usados. "Todos" (value vazio) e' a opcao
    // padrao — a matriz so recorta quando o usuario escolhe explicitamente um De ou Ate,
    // nunca vem pre-preenchida sozinha. Backlog so' existe no De (nao faz sentido comparar
    // Backlog com outro periodo) — escolher Backlog desabilita e ignora o Ate (ver desenhar()).
    const usadosNaveg = Estado.restrito
        ? usados.filter(i => Math.abs(i - idxAtual) <= 1)
        : usados;
    const opcoesPeriodo = '<option value="">Todos</option>' + usadosNaveg.map(i => `<option value=${i}>${nomePeriodo(Estado.ciclos[i].fat)}`).join('');
    const opcoesPeriodoDe = Estado.restrito ? opcoesPeriodo
        : '<option value="">Todos</option><option value=-1>Backlog' + usadosNaveg.map(i => `<option value=${i}>${nomePeriodo(Estado.ciclos[i].fat)}`).join('');
    const deAnterior = el('compDe').value, ateAnterior = el('compAte').value;

    el('compDe').innerHTML = opcoesPeriodoDe;
    el('compAte').innerHTML = opcoesPeriodo;
    el('compDe').value = (deAnterior == '-1' && !Estado.restrito) || usadosNaveg.includes(+deAnterior) ? deAnterior : '';
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
const passaFiltroTriEstado = (idSelect, valor) => {
    const v = el(idSelect).value;
    return v == 'B' || (v == 'S') == !!valor;
};
// aplica todos os filtros ativos (situacao, origem, titular, valor) sobre a lista de lancamentos.
// Valor: P/N pegam so' o que e' de fato positivo/negativo — lancamento sem valor (v = 0) nao e'
// nem um nem outro, entao fica de fora dos dois recortes.
const filtrarLancamentos = () => Estado.lancamentos.filter(r =>
    passaFiltroTriEstado('fativo', r.ativo) &&
    passaFiltroTriEstado('fpago', r.pago) &&
    ({ A: 1, D: !r.cred, F: r.cred })[el('origem').value] &&
    ({ T: 1, E: !r.isa, I: r.isa })[el('titular').value] &&
    ({ T: 1, P: r.v > 0, N: r.v < 0 })[el('fvalor').value]
);

// ===================================================================
// ORDENAÇÃO DE TABELAS — cada tabela (id) guarda seu proprio estado
// ===================================================================
function ordenarLinhas(linhas, idTabela) {
    const { k: coluna, d: direcao } = estadoOrdenacao(idTabela);
    const tipo = COLS.find(c => c[0] == coluna)[2];
    const copia = [...linhas];
    copia.sort((a, b) => {
        const A = a[coluna], B = b[coluna];
        const cmp = tipo == 'n' || tipo == 'b' || tipo == 'vol' ? ((+A || 0) - (+B || 0))
            : tipo == 'd' ? (timestamp(A) - timestamp(B))
                : String(A ?? '').localeCompare(String(B ?? ''), 'pt');
        const ordenado = direcao == 1 ? cmp : -cmp;
        if (ordenado) return ordenado;
        // saldo anterior sempre encabeca o dia: ele e' o ponto de partida, nao um evento
        if (a._sal !== b._sal) return a._sal ? -1 : 1;
        return (b.v || 0) - (a.v || 0);
    });
    return copia;
}

function atualizaAvisoFronteira() {
    // A fatura e' escolhida manualmente no formulario; nao existe mais aviso de fechamento.
    el('avisoFr').hidden = true;
}

// monta o <tr> de cabecalho de uma tabela, com a setinha de ordenacao na coluna ativa
function cabecalhoTabela(idTabela) {
    const cols = colunasAtivas();
    const { k: colunaAtiva, d: direcao } = estadoOrdenacao(idTabela);
    const linhaTitulos = cols.map(([chave, rotulo, tipo]) => {
        const seta = colunaAtiva == chave ? (direcao == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';
        return `<th class="${tipo == 'n' ? 'n' : ''}" onclick="sortCol('${idTabela}','${chave}')">${rotulo}${seta}`;
    }).join('');
    // 2a linha do header: campo de busca por coluna, so nas colunas de texto (tipo 't').
    // Modo simples (Isabella / mobile) nao tem busca nenhuma — so ordenar pelo header.
    if (modoSimples()) return linhaTitulos;
    const filtroAtual = estadoFiltroTexto(idTabela);
    // colunas de texto + Valor tem campo de busca. Valor compara numero (ver
    // passaFiltroTexto), nao texto, mas a caixinha e' a mesma das outras colunas —
    // com a mesma mascara de dinheiro do cadastro por cima (ver filtrarColuna).
    const linhaBusca = '<tr class=filtros>' + cols.map(([chave, rotulo, tipo]) => tipo == 't' || chave == 'valor'
        ? `<th class="${tipo == 'n' ? 'n' : ''}"><input type=text ${chave == 'valor' ? 'inputmode=numeric ' : ''}data-filtro="${idTabela}|${chave}" placeholder="Filtrar ${rotulo.toLowerCase()}…" value="${escapeHtml(filtroAtual[chave] ?? '')}" oninput="filtrarColuna('${idTabela}','${chave}',this)"></th>`
        : '<th>'
    ).join('');
    return linhaTitulos + linhaBusca;
}
// chamado a cada tecla digitada num campo de busca de coluna.
// desenhar() reescreve o innerHTML inteiro, o que tiraria o foco do campo a cada letra —
// por isso guarda onde estava o cursor e restaura depois, achando o campo novo pelo
// data-filtro (que sobrevive ao redesenho, ja que e' remontado igual).
window.filtrarColuna = (idTabela, coluna, input) => {
    // Valor usa a MESMA mascara de dinheiro do cadastro (formataMascaraDinheiro): os
    // digitos vao empurrando as casas decimais, tipo caixa eletronico. Assim a caixinha
    // mostra exatamente o numero procurado — digitar "15000" vira "150,00", sem duvida
    // sobre onde caem os centavos. Campo esvaziado tem que voltar pra vazio (filtro
    // desligado), nunca virar "0,00" — que filtraria pelos valores zerados.
    if (coluna == 'valor') {
        const cursorNoFim = input.selectionEnd == input.value.length;
        input.value = input.value.replace(/\D/g, '') ? formataMascaraDinheiro(input.value) : '';
        if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
    }
    estadoFiltroTexto(idTabela)[coluna] = input.value;
    const posicaoCursor = document.activeElement === input ? input.selectionStart : null;
    desenhar();
    const novoInput = document.querySelector(`[data-filtro="${idTabela}|${coluna}"]`);
    if (novoInput) { novoInput.focus(); if (posicaoCursor != null) novoInput.setSelectionRange(posicaoCursor, posicaoCursor); }
};
// remove acentos e caixa: "Café" e "cafe" viram a mesma coisa pra comparar
// uma linha passa no filtro de texto da tabela se contem (ignorando acento e maiuscula) todos os termos digitados
function passaFiltroTexto(r, idTabela) {
    const filtro = estadoFiltroTexto(idTabela);
    return Object.entries(filtro).every(([coluna, termo]) => {
        if (!termo) return true;
        // Valor nao e' texto: o campo sempre traz um numero ja mascarado (formataMascaraDinheiro),
        // entao compara por PROXIMIDADE em vez de substring — acha qualquer lancamento a ate
        // 5 centavos do valor digitado, pra nao exigir acertar o centavo exato. Ignora o sinal
        // dos dois lados (a mascara nao digita "-"): buscar "150" acha tanto -150 quanto +150.
        // Linha de Investimento sugerido mostra r._sug no lugar de r.v — busca no que esta visivel.
        if (coluna == 'valor') {
            const alvo = valorMascaraParaNumero(termo);
            const valorLinha = Math.abs(r._sug != null ? r._sug : (r.v || 0));
            return Math.abs(valorLinha - alvo) <= TOLERANCIA_BUSCA_VALOR;
        }
        return semAcento(r[coluna]).includes(semAcento(termo));
    });
}
// clique no header: 1o clique ordena asc, 2o desc, alternando (sem 3o estado "original")
window.sortCol = (idTabela, coluna) => {
    const estado = estadoOrdenacao(idTabela);
    if (estado.k != coluna) { estado.k = coluna; estado.d = 1; }
    else estado.d = estado.d == 1 ? 2 : 1;
    desenhar();
};

// clique no header da matriz Comparar: alterna asc/desc na mesma coluna, ou troca
// de coluna comecando por desc (o mais relevante costuma ser o maior valor)
window.sortComp = k => {
    const oc = Estado.ordComp;
    if (oc.k != k) { oc.k = k; oc.d = k == 'chave' ? 1 : 2; }
    else oc.d = oc.d == 1 ? 2 : 1;
    desenhar();
};

['fData', 'fNome', 'fCred', 'fIsa'].forEach(id =>
    el(id).addEventListener('change', atualizaAvisoFronteira));
el('fNome').addEventListener('input', atualizaAvisoFronteira);

// ===================================================================
// RENDERIZAÇÃO DE TABELAS
// ===================================================================
// chave de selecao de uma linha: usa o _sid sintetico (linha de fatura) ou o id real
const chaveSelecao = r => r._sid ? r._sid : (r.id != null ? String(r.id) : '');
// no mobile a cor do Valor muda de sentido: nao e' mais sinal (saida/entrada), e' status de
// pagamento (pago = verde, em aberto = vermelho). No desktop continua sendo o sinal (celValor).
// a linha sintetica "Fatura do cartao" nao tem 'pago' (nao vem do banco) -> cai em vermelho
// por padrao, o que e' aceitavel: ela representa uma saida que ainda vai vencer
const celValorMobile = r => `<td class="n ${r.pago ? 'vd' : 'vm'}">${brl(r.v)}`;
// texto de uma celula "vazia": trata null/undefined/"" E a string literal "null"/"undefined"
// que pode ter ficado gravada no banco por engano em alguma insercao anterior
// mesma logica de limpeza do valorValido: reconhece "null", "<null>", "n/a" etc como vazio
const ehVazioTextual = v => {
    if (v == null) return true;
    const limpo = String(v).trim().toLowerCase().replace(/^<|>$/g, '');
    return ['', 'null', 'undefined', 'nan', 'none', 'n/a'].includes(limpo);
};
const textoOuTraco = v => ehVazioTextual(v) ? '—' : v;
// linha REAL (existe na tabela lancamentos, da' pra dar PATCH): nao e' sintetica (fatura,
// saldo anterior, resgate/aporte) nem simulada (so' memoria, nunca foi salva)
const ehLinhaReal = r => Number.isInteger(+r.id) && +r.id > 0 && !r._sid && !r._sim;
// conteudo da celula Data: DD/MM/AAAA ou '—'. A fatura e' escolhida manualmente,
// portanto nao existe mais marca de fechamento/D+1.
const textoData = r => r.data ? dataBR(r.data) : '—';
// mesma ideia de celValorEditavel: clicar abre um <input type=date> inline. So' pra
// lancamentos REAIS (id do banco, da' pra dar PATCH) e so' no desktop — no mobile a
// celula continua sendo so' texto, igual o Valor.
const celData = r => ehLinhaReal(r) && !isMobile()
    ? `<span class="togData" data-tog-data="${escapeHtml(String(r.id))}" title="Clique pra editar a data">${textoData(r)}</span>`
    : textoData(r);
// monta as celulas <td> de uma linha, conforme o tipo de cada coluna
const celulasDaLinha = r => colunasAtivas().map(([chave, , tipo]) => chave == 'valor'
    ? (r._sug != null
        ? `<td class="n ${corValor(r._sug)}">${brl(r._sug)}`
        : (isMobile() ? celValorMobile(r) : (ehLinhaReal(r) ? celValorEditavel(r) : celValor(r.v)))).replace(/$/,
            r._saldo != null ? `<span class=sd>${brl(r._saldo)}</span>` : '')
    : tipo == 'b' ? `<td>${r[chave] == null ? '—'
        : `<span class="${r[chave] ? 'vd' : 'vm'} togPago" data-tog-pago="${escapeHtml(String(r.id))}" title="Clique pra alternar Pago/Aberto">${r[chave] ? 'Pago' : 'Aberto'}</span>`}`
        : `<td class="${tipo == 'n' ? 'n' : ''}">${chave == 'data'
            ? celData(r)
            : (chave == 'nome' && r._sim ? '<span class=simIco title="Simulado — não foi salvo">✦</span> ' : '') + textoOuTraco(r[chave])}`
).join('');
// renderiza uma tabela completa (cabecalho + linhas). 'selecionavel' liga o clique-pra-somar por linha.
const renderTabela = (linhasBrutas, idTabela, selecionavel) => {
    const linhas = linhasBrutas.filter(r => passaFiltroTexto(r, idTabela));
    if (!linhasBrutas.length) { Estado.linhasVisiveis[idTabela] = []; return '<p class=empty>Vazio</p>'; }
    if (!linhas.length) { Estado.linhasVisiveis[idTabela] = []; return `<div class=wrap><table><thead><tr>${cabecalhoTabela(idTabela)}</thead></table></div><p class=empty>Nenhum resultado com esse filtro.</p>`; }
    const ordenadas = ordenarLinhas(linhas, idTabela);
    // guarda na ordem REAL da tela (pos-ordenacao) — usado por "Selecionar tudo" e pelo
    // shift-click de intervalo, que dependem do indice bater com a posicao visual.
    Estado.linhasVisiveis[idTabela] = ordenadas;

    // saldo do dia: so na tabela de Debito e so com data ASCENDENTE — em qualquer outra
    // ordem "fim do dia" nao corresponde ao que esta na tela. Marca DEPOIS de ordenar,
    // na ultima linha de cada dia como ela realmente aparece.
    const ord = estadoOrdenacao(idTabela);
    ordenadas.forEach(r => { r._saldo = null; });
    if (idTabela == 'db' && ord.k == 'data' && ord.d == 1) {
        const saldo = saldoPorDia();
        ordenadas.forEach((r, i) => {
            const d = dataISO(r.data);
            if (!d || d < SALDO_DESDE) return;
            const prox = ordenadas[i + 1];
            if (!prox || dataISO(prox.data) !== d) r._saldo = saldo[d];   // ultima do dia
        });
    }

    return `<div class=wrap><table><thead><tr>${cabecalhoTabela(idTabela)}</thead><tbody>` +
        ordenadas.map(r => {
            const chave = chaveSelecao(r), marcada = selecionavel && chave && Estado.selecionados.has(chave);
            return `<tr class="${r._fat ? 'fat ' : ''}${r._sal ? 'sal ' : ''}${r._res ? 'res ' : ''}${r._sug != null ? 'sug ' : ''}${r._sim ? 'sim ' : ''}${marcada ? 'on' : ''}${selecionavel && chave ? ' pick' : ''}" data-sid="${selecionavel ? chave : ''}">` + celulasDaLinha(r);
        }).join('') + '</tbody></table></div>';
};

// casca comum de TODOS os blocos (Débito/Crédito/Backlog/Comparar): titulo com botao
// de collapse + linha de meta info + corpo por baixo. E' a MESMA estrutura/diagramacao
// pra todo mundo, inclusive o collapse (▾/▸, Estado.fechados[idTabela]) — assim trocar
// de visao (Ciclo <-> Comparar) fica impercetivel, os blocos sao visualmente identicos.
// 'corpoFn' e' chamada so' quando o bloco esta aberto (evita montar a tabela/matriz a
// toa quando esta fechado).
function blocoCasca(tituloHtml, subtitulo, n, idTabela, corpoFn) {
    const fechado = !!Estado.fechados[idTabela];
    const btnTog = `<button type=button class=tog onclick="alternarBloco('${idTabela}')" aria-label="${fechado ? 'Expandir' : 'Recolher'}">${fechado ? '▸' : '▾'}</button>`;
    const corpo = fechado ? '' : corpoFn();
    return `<div class=blk><h3>${btnTog}${tituloHtml}</h3><p class=meta>${n} ${n == 1 ? 'registro' : 'registros'} · ${subtitulo}</p>${corpo}</div>`;
}

// um card "Débito"/"Crédito"/"Backlog": titulo + total, subtitulo, tabela por baixo.
// quando selecionavel, ganha um botao "Selecionar tudo" que marca/desmarca todas as linhas
// dessa tabela de uma vez (respeitando o filtro de texto ativo, se houver).
// "Ver gráfico" mora na toolbar (#btGrafico, ao lado do filtro Ativo), nao mais aqui.
const renderBloco = (titulo, total, subtitulo, linhas, idTabela, selecionavel = false, extra = '') => {
    // 'extra' preenchido substitui o total no destaque: o titulo passa a exibir o que
    // falta pagar em evidencia, com o bruto de lado, apagado.
    const valor = extra.startsWith('<b') ? extra
        : `<b class="${corSoma(total)}">${brl(Math.abs(total))}</b>${extra}`;
    return blocoCasca(`${titulo} · ${valor}`, subtitulo, linhas.length, idTabela,
        () => renderTabela(linhas, idTabela, selecionavel));
};



// ===================================================================
// AS TRÊS VISÕES: Ciclo, Comparar, Investimento
// ===================================================================

// alocacaoAntecipacoes ja varre TODOS os periodos sozinha (e' O(periodos*lancamentos)) —
// chama-la de novo pra cada ciclo individual faz o custo virar O(periodos^2*lancamentos),
// que com uma tabela de periodos grande (ex: 1000 linhas) trava o navegador por dezenas de
// segundos. Por isso ela e' calculada UMA VEZ POR RENDER aqui, memoizada por base, e
// reaproveitada — nunca chamada dentro de um loop por idx.
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
    return Estado.lancamentos.filter(r =>
        passaFiltroTriEstado('fativo', r.ativo) && passaFiltroTriEstado('fpago', r.pago));
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
        return { tipo: 'resgate', nome: 'Resgate necessário', categ: 'Investimento', v: resgate };
    }
    if (totalBase > 0.005) return { tipo: 'aporte', nome: 'Aporte sugerido', categ: 'Investimento', v: -totalBase };
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

// Mesma logica de saldoDoCiclo, mas na base "conta unica" (so Ativo/Pago, ignora Origem/
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
function vCiclo() {
    const i = +el('ciclo').value;

    if (i < 0) {   // Backlog: lancamentos sem data ou fora de qualquer periodo
        const linhas = filtrarLancamentos().filter(r => r.periodoIdx == null);
        return renderBloco('Backlog', linhas.reduce((s, r) => s + r.v, 0), 'Sem data ou fora dos ciclos', linhas, 'bk', true);
    }

    const periodo = Estado.ciclos[i];
    if (!periodo) return '<p class=empty>Sem ciclos</p>';

    const debitos = filtrarLancamentos().filter(r => r.periodoIdx == i && !r.cred);
    const creditos = filtrarLancamentos().filter(r => r.periodoIdx == i && r.cred);
    const totalCredito = creditos.reduce((s, r) => s + r.v, 0);

    // Ha um unico cartao detalhado. A fatura da Isabella e' um lancamento comum no bloco
    // Debito, com valor atualizado manualmente, e nunca vira uma linha sintetica aqui.
    // O vencimento vem da fatura escolhida manualmente em cada credito.
    const vencimentoDaFatura = vencimentoDoCiclo(i);
    const visiveis = filtrarLancamentos();
    const abatido = alocacaoAntecipacoes(visiveis);

    const montaLinhaFatura = () => {
        const total = creditos.reduce((s, r) => s + r.v, 0);
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

    // total liquido do credito: o bruto menos o que ja foi antecipado. E' o mesmo numero
    // que aparece na linha de fatura do bloco Debito — aqui so como referencia no titulo.
    const totalFaturaLiquido = linhasFatura.reduce((s, r) => s + r.v, 0);

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

    // so a Isabella (perfil restrito) nao ve o bloco Credito. No mobile, quem nao e' a
    // Isabella VE o Credito normalmente (so o resto do "modo simples" e' escondido).
    if (Estado.restrito) return blocoDebito;

    // com fatura em aberto, o destaque vai pro que FALTA pagar e o bruto fica de lado,
    // apagado. Quitada (ou sem antecipacao), mostra so o total normal.
    const faltaPagar = Math.abs(totalFaturaLiquido);
    const houveAbatimento = Math.abs(totalFaturaLiquido - totalCredito) > 0.005;
    const blocoCredito = renderBloco(
        'Crédito', totalCredito,
        tituloFaturaDoCiclo(i),
        creditos, 'cr', true,
        houveAbatimento && faltaPagar > 0.005
            ? `<b class="${corSoma(totalFaturaLiquido)}">${brl(faltaPagar)}</b><span class=bruto>de ${brl(Math.abs(totalCredito))}</span>`
            : ''
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
        periodosUsados.map(i => `<th class=n onclick="sortComp('${i}')">${nomePeriodo(Estado.ciclos[i].fat)}${seta(String(i))}`).join('') +
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



// ===================================================================
// PERFIL RESTRITO (Isabella) e DESENHO GERAL DA TELA
// ===================================================================
// perfil restrito (Isabella): desenhar() ja forca sozinho o "modo blocos" (De==Ate) e
// esconde os demais filtros quando modoSimples() e' true — nao ha mais nada especifico
// pra aplicar aqui no login, a funcao fica so' documentando esse ponto de entrada.
function aplicaPerfil() { }

// redesenha a tela conforme o modo ativo (blocos Debito/Credito vs matriz de comparacao),
// escondendo/mostrando os filtros que fazem sentido em cada um
function desenhar() {
    console.time('[diag] desenhar');
    Object.keys(_cacheSaldo).forEach(k => delete _cacheSaldo[k]);
    Object.keys(_cacheAjuste).forEach(k => delete _cacheAjuste[k]);
    Object.keys(_cacheSaldoUnico).forEach(k => delete _cacheSaldoUnico[k]);
    Object.keys(_cacheAjusteUnico).forEach(k => delete _cacheAjusteUnico[k]);
    _baseFiltrada = _abatFiltrada = _baseUnica = _abatUnica = null;   // recalcula 1x neste render
    const simples = modoSimples();

    el('fciclo').hidden = true;   // #ciclo e' so' a fonte de verdade interna que vCiclo() le, nunca aparece

    // ao nao ter De/Ate escolhidos ainda (1a carga), pre-preenche com o ciclo ATUAL nos
    // dois — abre direto no modo blocos do mes corrente (De=Ate=atual), igual o botao
    // "Atual" faz e igual a visao Ciclo antiga sempre abria
    if (!el('compDe').value && !el('compAte').value && Estado.idxHoje >= 0) {
        el('compDe').value = Estado.idxHoje;
        el('compAte').value = Estado.idxHoje;
    }

    // "modo blocos" (De==Ate, De=Backlog, ou modo simples — mobile/Isabella sempre
    // navegam ciclo a ciclo) delega a tela pra vCiclo() (via vComp()); fora disso e'
    // "modo matriz". So' existe esse UM criterio — a antiga visao "Ciclo"/"Comparar"
    // separada foi removida, unificada dentro do fluxo Comparar (De==Ate cobre
    // exatamente o que a visao Ciclo cobria), e o navegador ‹›Atual tambem saiu — De/Ate
    // ficam sempre visiveis, e Backlog e' so' mais uma opcao do De.
    if (simples && el('compDe').value !== el('compAte').value) {
        // simples troca pro ciclo ATUAL (nunca deixa De != Ate escapar pro modo simples)
        const idx = Estado.idxHoje >= 0 ? Estado.idxHoje : 0;
        el('compDe').value = idx; el('compAte').value = idx;
    }
    const ehBacklog = el('compDe').value == '-1';
    const modoBlocos = ehBacklog || (!!el('compDe').value && el('compDe').value == el('compAte').value);
    // Backlog nao compara com outro periodo — o Ate fica desabilitado e ignorado
    // enquanto o De for Backlog (nao da' pra escolher um Ate junto com Backlog).
    el('compAte').disabled = ehBacklog;
    if (modoBlocos) el('ciclo').value = ehBacklog ? -1 : el('compDe').value;   // vCiclo() le o combo interno

    // Origem so faz sentido comparando a matriz de verdade (2+ periodos) — some de
    // verdade (hidden) fora do fluxo, sem deixar buraco reservado, mas com um fade suave
    // em vez de corte seco.
    mostraComFade('forigem', !modoBlocos && !simples);
    if (modoBlocos) el('origem').value = 'A';
    el('ftit').hidden = simples;
    el('fvalWrap').hidden = simples;
    if (simples) el('fvalor').value = 'T';
    el('flimpar').hidden = simples;   // no modo simples quase nao ha filtro pra limpar
    if (simples) {
        el('fsit').hidden = el('fativoWrap').hidden = true;
        el('fpago').value = 'B'; el('fativo').value = 'S';   // ve tudo (pago+aberto), so os ativos
    }
    const noBacklog = modoBlocos && +el('ciclo').value < 0;
    if (!simples) el('fativo').value = noBacklog ? 'B' : 'S';
    if (!modoBlocos) el('origem').value = 'A';

    // "Ver gráfico" so faz sentido com um ciclo de verdade selecionado (fora do Backlog,
    // que nao tem periodo pra desenhar a pizza).
    mostraComFade('fgraf', modoBlocos && !simples && !noBacklog);
    el('btGrafico').dataset.idx = el('ciclo').value;
    mostraComFade('fevol', !modoBlocos && !simples && !!el('compDe').value && !!el('compAte').value);

    // fade suave SO' quando muda de modo (blocos <-> matriz) — nao em todo redesenho
    // (ex: digitar num filtro de texto), senao a tela piscaria a cada tecla
    const trocouModo = Estado._modoBlocosAnterior != null && Estado._modoBlocosAnterior != modoBlocos;
    Estado._modoBlocosAnterior = modoBlocos;
    // #out.innerHTML e' reescrito do zero a cada desenhar() (ex: a cada linha marcada
    // no shift-click) — sem isso, o scroll INTERNO de cada tabela (.wx/.wrap tem
    // overflow:auto proprio) e' perdido a cada redesenho, dando a impressao de que a
    // tabela "reseta" a visao no meio de um shift-click. Guarda a posicao de cada
    // container rolavel (por indice — o mesmo modo gera os mesmos blocos, na mesma
    // ordem, entre um redesenho e outro) e restaura depois, exceto ao trocar de modo
    // de verdade (blocos <-> matriz), onde nao ha posicao antiga que faca sentido.
    const scrollsAntigos = [...el('out').querySelectorAll('.wx, .wrap')].map(e => [e.scrollTop, e.scrollLeft]);
    el('out').innerHTML = modoBlocos ? vCiclo() : vComp();
    if (!trocouModo) {
        [...el('out').querySelectorAll('.wx, .wrap')].forEach((e, i) => {
            if (!scrollsAntigos[i]) return;
            [e.scrollTop, e.scrollLeft] = scrollsAntigos[i];
        });
    }
    // "Somente Diferentes" so faz sentido comparando EXATAMENTE 2 periodos — vComp()
    // deixa a informacao pronta em Estado._comparacao2Periodos como efeito colateral,
    // porque so' ali se sabe quantos periodos a matriz de fato usou.
    mostraComFade('fdif', !modoBlocos && !simples && !!Estado._comparacao2Periodos);
    if (trocouModo) {
        el('out').classList.remove('fadeIn');
        void el('out').offsetWidth;   // forca reflow pra reiniciar a animacao mesmo se ja rodou antes
        el('out').classList.add('fadeIn');
    }
    // limpa a selecao SO' na troca de modo (blocos <-> matriz) — as chaves de selecao de
    // um lado nao existem no outro (linhas reais do Ciclo vs categorias "cp:" do Comparar),
    // mas dentro do MESMO modo a selecao tem que sobreviver a redesenhos normais (trocar
    // filtro, digitar em busca, etc), senao a barra de soma nunca fica de pe' no Comparar.
    if (trocouModo) Estado.selecionados.clear();
    if (typeof atualizaBarraSelecao == 'function') atualizaBarraSelecao();
    if (typeof atualizaBtCicloHoje == 'function') atualizaBtCicloHoje();
    if (typeof atualizaBtsNavCiclo == 'function') atualizaBtsNavCiclo();
    console.timeEnd('[diag] desenhar');
}

// ===================================================================
// SELEÇÃO DE LINHAS (barra flutuante de soma)
// ===================================================================
function atualizaBarraSelecao() {
    if (!Estado.selecionados.size) { el('selbar').style.display = 'none'; return; }

    const chaves = [...Estado.selecionados.keys()];
    // Linhas sinteticas nao existem no banco e, por isso, nao podem ser duplicadas nem
    // excluidas. As excecoes de ACAO sao os ajustes "sug:" e "res:": Aporte sugerido
    // e Resgate necessario podem ser materializados como lancamentos reais.
    const ehSintetica = c => /^(fat|cp|sal|res|sug|abt):/.test(c);
    const chaveUnica = chaves.length == 1 ? chaves[0] : null;
    const ehAjusteMaterializavel = !!chaveUnica && /^(sug|res):/.test(chaveUnica);
    const chaveUnicaReal = chaveUnica && !ehSintetica(chaveUnica) ? chaveUnica : null;

    // uma linha real: a barra e' so pra duplicar. Varias (ou uma sintetica sozinha): e'
    // pra somar e selecionar/limpar. Nunca os dois juntos — pra desmarcar uma linha unica,
    // basta clicar nela de novo. Selecao multipla + soma funciona igual em qualquer
    // tela/perfil (mobile e Isabella inclusive) — nao depende mais de modoSimples().
    el('seldup').hidden = !chaveUnicaReal && !ehAjusteMaterializavel;
    el('seldup').textContent = ehAjusteMaterializavel ? 'Materializar' : 'Duplicar';
    el('seldel').hidden = !chaveUnicaReal;
    el('selacao').hidden = !!chaveUnicaReal || ehAjusteMaterializavel;

    if (chaveUnica) {
        const r = linhaDaChaveSelecao(chaveUnica);
        el('selinfo').innerHTML =
            `<span class=cnt>Selecionado</span>` +
            `<span class="val ${corValor(r?.v || 0)}">${escapeHtml(r?.nome ?? '')}</span>`;
    } else {
        let soma = 0;
        for (const v of Estado.selecionados.values()) soma += v;
        el('selinfo').innerHTML =
            `<span class=cnt>${Estado.selecionados.size} selecionados</span>` +
            `<span class="val ${corSoma(soma)}">${brl(soma)}</span>`;
        el('selacao').textContent = 'Limpar';
    }

    el('selbar').style.display = 'flex';
}
// Resolve tanto lancamentos reais quanto linhas sinteticas que so existem nas tabelas
// renderizadas (ex.: Aporte sugerido). Centralizar isso tambem garante que a barra mostre
// nome/valor dessas linhas em vez de tentar acha-las apenas em Estado.lancamentos.
function linhaDaChaveSelecao(chave) {
    for (const linhas of Object.values(Estado.linhasVisiveis)) {
        const r = linhas.find(x => chaveSelecao(x) === chave);
        if (r) return r;
    }
    return Estado.lancamentos.find(x => String(x.id) === chave) || null;
}
// valor de uma linha a partir da sua chave de selecao (linha real ou fatura sintetica)
function valorDaChave(chave) {
    // Fatura sintetica
    if (chave.startsWith('fat:')) {
        return Estado.valorFaturaPorCiclo[chave] || 0;
    }

    // Procura primeiro nas linhas atualmente renderizadas.
    // Isso inclui Saldo do mês anterior, Resgate necessário
    // e Investimento sugerido, que não existem em Estado.lancamentos.
    const visivel = linhaDaChaveSelecao(chave);
    if (visivel) return visivel._sug != null ? visivel._sug : (visivel.v || 0);

    // Linha real vinda do banco
    const r = Estado.lancamentos.find(x => String(x.id) === chave);
    return r ? (r.v || 0) : 0;
}
function alternarSelecao(chave) {
    if (!chave) return;
    const jaEstava = Estado.selecionados.has(chave);
    if (jaEstava) Estado.selecionados.delete(chave);
    else Estado.selecionados.set(chave, valorDaChave(chave));
    Estado.ultimaClicada = chave;
    desenhar();
}

// shift-click: aplica na linha atual o intervalo entre ela e a ultima linha clicada,
// dentro da MESMA tabela (respeitando a ordem em que as linhas estao na tela agora).
// A ACAO (marcar ou desmarcar) segue o que um clique normal faria na linha atual: se ela
// ja estava marcada, o shift desmarca o intervalo inteiro; senao, marca o intervalo inteiro.
function selecionarIntervalo(idTabela, chave) {
    const linhas = (Estado.linhasVisiveis[idTabela] || []).map(chaveSelecao).filter(Boolean);
    const iAtual = linhas.indexOf(chave);
    const iAncora = linhas.indexOf(Estado.ultimaClicada);
    if (iAtual < 0 || iAncora < 0) { alternarSelecao(chave); return; }
    const desmarcando = Estado.selecionados.has(chave);
    const [ini, fim] = iAncora <= iAtual ? [iAncora, iAtual] : [iAtual, iAncora];
    for (let i = ini; i <= fim; i++) {
        const c = linhas[i];
        if (desmarcando) Estado.selecionados.delete(c);
        else if (!Estado.selecionados.has(c)) Estado.selecionados.set(c, valorDaChave(c));
    }
    Estado.ultimaClicada = chave;
    desenhar();
}

window.alternarBloco = idTabela => {
    Estado.fechados[idTabela] = !Estado.fechados[idTabela];
    if (Estado.fechados[idTabela]) {
        (Estado.linhasVisiveis[idTabela] || []).map(chaveSelecao).filter(Boolean)
            .forEach(c => Estado.selecionados.delete(c));
        Estado.linhasVisiveis[idTabela] = [];
    }
    desenhar();
};

// clique no badge "Pago"/"Aberto" alterna o status na hora, sem selecionar a linha (o
// listener de selecao abaixo esta no MESMO #out — precisa vir ANTES e parar a propagacao,
// senao o clique tambem selecionaria a linha inteira por baixo do badge).
el('out').addEventListener('click', async e => {
    const badge = e.target.closest('[data-tog-pago]');
    if (!badge) return;
    // stopPropagation NAO basta aqui: os dois listeners estao no MESMO elemento (#out),
    // entao ambos disparam na mesma fase de bubbling nao importa o que este pare de
    // propagar — precisa de stopImmediatePropagation pra impedir o listener de selecao
    // (registrado logo abaixo, no mesmo #out) de rodar tambem.
    e.stopImmediatePropagation();

    const id = badge.dataset.togPago;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const novoPago = !r.pago;
    badge.classList.toggle('vd', novoPago);
    badge.classList.toggle('vm', !novoPago);
    badge.textContent = novoPago ? 'Pago' : 'Aberto';
    badge.style.opacity = .5;   // feedback imediato enquanto o PATCH esta no ar

    try {
        if (!r._sim) await atualizarLancamento(r.id, { pago: novoPago });
        r.pago = novoPago;
        desenhar();
    } catch (err) {
        badge.style.opacity = '';
        alert('Falhou ao atualizar: ' + err.message);
        desenhar();   // redesenha pra garantir que o badge volta a refletir o estado real
    }
});

// clique no Valor troca o <span> por um <input> mascarado (mesma mascara do form de
// lancamento), focado e com o texto ja selecionado. Enter ou blur confirma; Escape
// cancela sem salvar. Mesmo esquema do toggle Pago acima: stopImmediatePropagation pra
// nao disparar a selecao da linha por baixo.
el('out').addEventListener('click', e => {
    const span = e.target.closest('[data-tog-valor]');
    if (!span) return;
    // ja esta em edicao (input aberto): so' impede o clique de vazar pra selecao de
    // linha por baixo — o proprio <input> cuida do cursor/foco nativamente.
    if (span.classList.contains('editando')) { e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();

    const id = span.dataset.togValor;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const bruto = Math.abs(r.v || 0);
    const negativo = (r.v || 0) < 0;
    span.classList.add('editando');
    span.innerHTML = `<span class=inpValorSinal>${negativo ? '−' : '+'}</span>` +
        `<input type=text inputmode=numeric class=inpValor value="${bruto ? formataMascaraDinheiro(String(Math.round(bruto * 100))) : ''}" placeholder="0,00">`;
    const input = span.querySelector('input');
    const sinalEl = span.querySelector('.inpValorSinal');
    let sinalNegativo = negativo;

    input.addEventListener('input', () => {
        const cursorNoFim = input.selectionEnd == input.value.length;
        input.value = formataMascaraDinheiro(input.value);
        if (cursorNoFim) input.setSelectionRange(input.value.length, input.value.length);
    });
    // clique no sinal (+/−) alterna, sem submeter nem perder o foco do input
    sinalEl.onclick = ev => {
        ev.stopImmediatePropagation();
        sinalNegativo = !sinalNegativo;
        sinalEl.textContent = sinalNegativo ? '−' : '+';
        input.focus();
    };

    let concluido = false;
    async function confirma() {
        if (concluido) return;
        concluido = true;
        const novoValor = valorMascaraParaNumero(input.value.trim() || '0') * (sinalNegativo ? -1 : 1);
        if (novoValor == r.v) { desenhar(); return; }   // nada mudou, so' redesenha (sai do modo edicao)
        input.disabled = true;
        try {
            if (!r._sim) await atualizarLancamento(r.id, { valor: novoValor });
            r.valor = novoValor;
            r.v = novoValor;
            desenhar();
        } catch (err) {
            alert('Falhou ao atualizar: ' + err.message);
            desenhar();
        }
    }
    function cancela() { concluido = true; desenhar(); }

    input.addEventListener('keydown', ev => {
        if (ev.key == 'Enter') { ev.preventDefault(); confirma(); }
        else if (ev.key == 'Escape') { ev.preventDefault(); cancela(); }
    });
    input.addEventListener('blur', () => confirma());

    input.focus();
    input.select();
});

// Recalcula em qual ciclo um lancamento cai, com a MESMA regra da carga inicial
// (carregarDados) — mudar a data pode jogar a linha pra outro periodo, ou pro Backlog
// quando a data e' apagada / cai fora de todos os periodos cadastrados.
function reclassificaPeriodo(r) {
    const idx = !r.data ? null
        : r.cred ? periodoDaFatura(r.fatura_id)
            : periodoDoDebito(dataISO(r.data));
    r.periodoIdx = idx != null && idx >= 0 && idx < Estado.ciclos.length ? idx : null;
}

// clique na Data troca o <span> por um <input type=date>. O banco ja guarda 'YYYY-MM-DD',
// que e' exatamente o formato do value/atributo desse input — nao ha conversao nenhuma no
// meio (a tela e' que mostra DD/MM/AAAA, via dataBR). Enter ou escolher no calendario
// confirma; Escape cancela. Mesmo esquema do toggle Pago e do Valor: stopImmediatePropagation
// pra nao disparar a selecao da linha por baixo.
el('out').addEventListener('click', e => {
    const span = e.target.closest('[data-tog-data]');
    if (!span) return;
    if (span.classList.contains('editando')) { e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();

    const id = span.dataset.togData;
    const r = Estado.lancamentos.find(x => String(x.id) == id);
    if (!r) return;

    const original = dataISO(r.data);
    span.classList.add('editando');
    span.innerHTML = `<input type=date class=inpData value="${original}">`;
    const input = span.querySelector('input');

    let concluido = false;
    async function confirma() {
        if (concluido) return;
        concluido = true;
        const nova = input.value || null;   // apagar a data manda o lancamento pro Backlog
        if ((nova || '') === original) { desenhar(); return; }   // nada mudou, so' sai do modo edicao
        input.disabled = true;
        try {
            if (!r._sim) await atualizarLancamento(r.id, { data: nova });
            r.data = nova;
            reclassificaPeriodo(r);
            desenhar();
        } catch (err) {
            alert('Falhou ao atualizar: ' + err.message);
            desenhar();
        }
    }
    function cancela() { concluido = true; desenhar(); }

    input.addEventListener('keydown', ev => {
        if (ev.key == 'Enter') { ev.preventDefault(); confirma(); }
        else if (ev.key == 'Escape') { ev.preventDefault(); cancela(); }
    });
    input.addEventListener('change', () => confirma());   // escolheu no calendario nativo
    input.addEventListener('blur', () => confirma());
    // clique dentro do proprio input (inclusive no icone do calendario) nao pode vazar
    // pro listener de selecao de linha, que esta no mesmo #out
    input.addEventListener('click', ev => ev.stopImmediatePropagation());

    input.focus();
});

el('out').addEventListener('click', e => {
    const linha = e.target.closest('tr[data-sid]');
    if (!linha || !linha.dataset.sid || e.target.closest('th')) return;
    if (e.shiftKey) { const s = getSelection(); if (s) s.removeAllRanges(); }   // limpa a selecao de texto nativa do shift-click
    if (e.shiftKey && !isMobile() && Estado.ultimaClicada) {
        const idTabela = Object.keys(Estado.linhasVisiveis)
            .find(id => (Estado.linhasVisiveis[id] || []).some(r => chaveSelecao(r) === linha.dataset.sid));
        if (idTabela) { selecionarIntervalo(idTabela, linha.dataset.sid); return; }
    }
    alternarSelecao(linha.dataset.sid);
});
el('selacao').onclick = () => { Estado.selecionados.clear(); desenhar(); };
el('ciclo').addEventListener('change', () => { Estado.selecionados.clear(); atualizaBarraSelecao(); });
// trocar De/Ate refaz a matriz do zero (outras categorias/periodos podem entrar ou sair)
// — limpa a selecao pelo mesmo motivo que trocar o combo Ciclo limpa, acima.
// Intervalo invertido (De > Ate) nao faz sentido: o campo que o usuario ACABOU de
// escolher "ganha", empurrando o outro pra igualar ele — mexeu no De e ficou maior que
// o Ate? o Ate sobe junto. Mexeu no Ate e ficou menor que o De? o De desce junto.
el('compDe').addEventListener('change', () => {
    if (el('compDe').value && el('compDe').value != '-1' && el('compAte').value
        && +el('compDe').value > +el('compAte').value) {
        el('compAte').value = el('compDe').value;
    }
    Estado.selecionados.clear(); atualizaBarraSelecao();
});
el('compAte').addEventListener('change', () => {
    if (el('compDe').value && el('compDe').value != '-1' && el('compAte').value
        && +el('compAte').value < +el('compDe').value) {
        el('compDe').value = el('compAte').value;
    }
    Estado.selecionados.clear(); atualizaBarraSelecao();
});

el('btGrafico').onclick = () => abrirGraficoGastos(+el('btGrafico').dataset.idx);
el('btEvolucao').onclick = () => abrirGraficoEvolucao(+el('compDe').value, +el('compAte').value);

// volta pro ciclo atual (De=Ate=hoje) — mesmo padrao com que a pagina abre. Fica
// desabilitado quando hoje nao cai em periodo nenhum.
function atualizaBtCicloHoje() {
    el('cicloHoje').disabled = Estado.idxHoje < 0;
}
el('cicloHoje').onclick = () => {
    if (Estado.idxHoje < 0) return;
    el('compDe').value = Estado.idxHoje;
    el('compAte').value = Estado.idxHoje;
    Estado.selecionados.clear();
    desenhar();
};

// ‹ / › navegam pro periodo anterior/seguinte. Anda pelas OPCOES reais do combo #compDe
// (ja filtradas certo pra Isabella/perfil restrito e com Backlog como 1a opcao), nao por
// indice aritmetico — assim respeita os mesmos limites de navegacao sem duplicar a logica.
// Com De==Ate (1 ciclo so', "modo blocos") sempre foi assim: anda 1 a 1, igualando os
// dois (entra direto no modo blocos daquele ciclo). Comparando um INTERVALO (De != Ate,
// ex: 2 meses de distancia) o clique desliza a janela inteira mantendo a MESMA distancia
// entre De e Ate — um passo pra CADA lado (De e Ate andam +1/-1 juntos), nunca pulando
// pelo tamanho do intervalo inteiro, senao "Jan-Mar" viraria "Mai-Jul" de uma vez em vez
// de "Fev-Abr". Backlog nunca entra nesse modo — De='-1' sempre deixa Ate desabilitado
// (ver desenhar()), entao so' chega aqui com os dois periodos reais.
function navegaCiclo(direcao) {
    const opcoes = [...el('compDe').options].map(o => o.value).filter(v => v !== '');
    const deAtual = el('compDe').value || '', ateAtual = el('compAte').value || '';
    const posDeAtual = opcoes.indexOf(deAtual);
    const comparandoIntervalo = deAtual && deAtual !== '-1' && ateAtual && deAtual !== ateAtual;

    if (comparandoIntervalo) {
        const posAteAtual = opcoes.indexOf(ateAtual);
        const novaPosDe = posDeAtual + direcao, novaPosAte = posAteAtual + direcao;
        if (novaPosDe < 1 || novaPosAte >= opcoes.length) return;   // nunca pousa em Backlog nem passa do fim
        el('compDe').value = opcoes[novaPosDe];
        el('compAte').value = opcoes[novaPosAte];
        Estado.selecionados.clear();
        desenhar();
        return;
    }

    const novaPos = posDeAtual < 0 ? (direcao > 0 ? 0 : -1) : posDeAtual + direcao;
    if (novaPos < 0 || novaPos >= opcoes.length) return;
    const novoValor = opcoes[novaPos];
    el('compDe').value = novoValor;
    el('compAte').value = novoValor == '-1' ? el('compAte').value : novoValor;
    Estado.selecionados.clear();
    desenhar();
}
function atualizaBtsNavCiclo() {
    const opcoes = [...el('compDe').options].map(o => o.value).filter(v => v !== '');
    const deAtual = el('compDe').value || '', ateAtual = el('compAte').value || '';
    const posDe = opcoes.indexOf(deAtual);
    const comparandoIntervalo = deAtual && deAtual !== '-1' && ateAtual && deAtual !== ateAtual;

    if (comparandoIntervalo) {
        const posAte = opcoes.indexOf(ateAtual);
        el('cicloAnterior').disabled = posDe <= 1;
        el('cicloProximo').disabled = posAte < 0 || posAte >= opcoes.length - 1;
    } else {
        el('cicloAnterior').disabled = posDe <= 0;
        el('cicloProximo').disabled = posDe < 0 || posDe >= opcoes.length - 1;
    }
}
el('cicloAnterior').onclick = () => navegaCiclo(-1);
el('cicloProximo').onclick = () => navegaCiclo(1);

// qualquer select/checkbox da barra de ferramentas redesenha a tela ao mudar
// >>> LOG TEMP: try/catch aqui so pra diagnostico — sem isso, um erro no desenhar()
// disparado por um filtro (fora do try do load()) sumia sem aparecer em lugar nenhum.
// compDe/compAte moraram em .tool ate virarem parte do slot #navComparar (em .head,
// pra nao dar "tremor" de layout ao trocar Ciclo/Comparar) — por isso entram na
// selecao aqui tambem, senao o "onchange" generico da toolbar nunca os alcança.
document.querySelectorAll('.tool select,.tool input,#navComparar select').forEach(e => e.onchange = () => {
    try { desenhar(); } catch (err) { console.error('[diag] erro ao redesenhar apos mudar filtro:', err); }
});

// ===================================================================
// LIMPAR FILTROS — devolve a tela pro estado em que ela abre
// ===================================================================
// Valor padrao de cada select da toolbar: e' a 1a <option> de cada um no index.html, que e'
// tambem o que o navegador seleciona sozinho na 1a carga. desenhar() ainda pode sobrescrever
// alguns deles conforme o modo (ex: Ativo vira "Ambos" no Backlog, Origem volta pra "Tudo"
// no modo blocos) — o padrao aqui e' so' o ponto de partida, igual na abertura da pagina.
const FILTROS_PADRAO = { titular: 'T', fpago: 'B', fativo: 'S', origem: 'A', somenteDif: 'N', fvalor: 'T' };

function limparFiltros() {
    Object.entries(FILTROS_PADRAO).forEach(([id, valor]) => { el(id).value = valor; });
    Estado.filtroTexto = {};      // buscas por coluna (Data/Nome/Valor/Categoria/Frequência)
    Estado.fechados = {};         // blocos recolhidos voltam a abrir
    Estado.selecionados.clear();  // as linhas marcadas somem junto com o recorte que as gerou
    Estado.ordenacaoPorTabela = {};   // volta pra ordenacao padrao (data ascendente)
    Estado.ordComp = { k: 'total', d: 2 };
    excluidasDoGrafico = [];      // categorias excluidas da pizza
    // De/Ate: zerar os dois faz desenhar() repor o ciclo ATUAL nos dois (mesmo caminho da
    // 1a carga). Sem ciclo atual, ficam em "Todos" — que tambem e' como a pagina abriria.
    el('compDe').value = '';
    el('compAte').value = '';
    desenhar();
}
el('btLimparFiltros').onclick = limparFiltros;

// ===================================================================
// VISUALIZAÇÃO: ROBERTA — acerto de contas
// ===================================================================
// Ela adiantou um valor de uma vez (entra POSITIVO na categoria) e a divida vai sendo
// quitada aos poucos com o que sai pra ela (negativo — credito ou debito, tanto faz).
// De proposito olha TODOS os lancamentos da categoria e IGNORA os filtros/ciclo da barra:
// o acerto e' a relacao inteira, nao um recorte dela. Conta so' o que ja e' fato: 'ativo'
// (desativado foi cancelado) e 'pago' — enquanto o pagamento nao aconteceu o dinheiro nao
// saiu, e contar agendado inflaria o progresso do acerto.
const ehCategoria = (categ, procurada) => semAcento(categ).trim() === semAcento(procurada).trim();

function dadosCategoria(categoria) {
    const linhas = Estado.lancamentos.filter(r => r.ativo && r.pago && ehCategoria(r.categ, categoria));
    const entradas = linhas.reduce((s, r) => s + Math.max(r.v, 0), 0);
    const saidas = linhas.reduce((s, r) => s - Math.min(r.v, 0), 0);
    // O percentual visual para em 100%, mas o saldo continua mostrando excesso de saída.
    const pctUsado = entradas ? Math.min(100, saidas / entradas * 100) : 0;
    return { linhas, entradas, saidas, saldo: entradas - saidas, pctUsado, pctRestante: 100 - pctUsado };
}

// Entrada Econ, Evolução Obra e Dívida Estudantil medem execução financeira: o universo é tudo que
// está ativo no recorte (pago + não pago), e a barra compara o valor pago com esse total.
// Usa valor absoluto porque despesas são armazenadas com sinal negativo.
function dadosPagamentoCategoria(op) {
    const campo = op.campo || 'categ';
    const valor = op.valor || op.categoria;
    const linhas = Estado.lancamentos.filter(r =>
        r.ativo && ehCategoria(r[campo], valor) && (!op.somenteNegativos || r.v < 0)
    );
    const total = linhas.reduce((s, r) => s + Math.abs(r.v), 0);
    const pago = linhas.filter(r => r.pago).reduce((s, r) => s + Math.abs(r.v), 0);
    const naoPago = Math.max(0, total - pago);
    const pctPago = total ? Math.min(100, pago / total * 100) : 0;
    return { linhas, total, pago, naoPago, pctPago };
}

const pct1 = n => n.toFixed(1).replace('.', ',') + '%';

function abrirVisCategoria(op) {
    const d = dadosCategoria(op.categoria);
    const encerrado = d.saldo <= 0.005;
    const semBase = d.entradas <= 0.005;
    const pctDestaque = encerrado ? 0 : d.pctRestante;
    el('tituloVisCategoria').textContent = op.titulo;
    el('robertaCorpo').innerHTML = !d.linhas.length
        ? `<p class=meta>Nenhum lançamento pago na categoria “${escapeHtml(op.categoria)}” ainda.</p>`
        : `<div class="robPct ${encerrado ? 'vd' : 'vm'}">${semBase ? '—' : pct1(pctDestaque)}</div>
           <p class=robPctSub>${encerrado ? op.subEncerrado : op.subAberto}</p>
           <div class=robBarra><div class=robFill style="width:${d.pctUsado.toFixed(2)}%"></div></div>
           <div class=robLegenda>
             <span>${semBase ? 'Sem entrada positiva' : `${op.legendaUsado} ${pct1(d.pctUsado)}`}</span>
             <span>${d.linhas.length} lançamento${d.linhas.length > 1 ? 's' : ''}</span>
           </div>
           <table class=robTab><tbody>
             <tr><td>${op.rotuloEntrada}<td class="n vm">${brl(d.entradas)}
             <tr><td>${op.rotuloSaida}<td class="n vd">${brl(d.saidas)}
             <tr class=tot><td>${d.saldo < -0.005 ? op.rotuloExcesso : op.rotuloSaldo}<td class=n>${brl(Math.abs(d.saldo))}
           </tbody></table>`;
    el('modalRoberta').showModal();
}

function abrirVisPagamentoCategoria(op) {
    const d = dadosPagamentoCategoria(op);
    const concluido = d.total > 0 && d.naoPago <= 0.005;
    const valorFiltro = op.valor || op.categoria;
    const rotuloFiltro = op.campo == 'nome' ? 'nome' : 'categoria';
    el('tituloVisCategoria').textContent = op.titulo;
    el('robertaCorpo').innerHTML = !d.linhas.length
        ? `<p class=meta>Nenhum lançamento ativo com ${rotuloFiltro} “${escapeHtml(valorFiltro)}” ainda.</p>`
        : `<div class="robPct ${concluido ? 'vd' : 'vm'}">${pct1(d.pctPago)}</div>
           <p class=robPctSub>do valor total está pago</p>
           <div class=robBarra><div class=robFill style="width:${d.pctPago.toFixed(2)}%"></div></div>
           <div class=robLegenda>
             <span>Pago ${pct1(d.pctPago)}</span>
             <span>${d.linhas.length} lançamento${d.linhas.length > 1 ? 's' : ''}</span>
           </div>
           <table class=robTab><tbody>
             <tr><td>Pago<td class="n vd">${brl(d.pago)}
             <tr><td>Não pago<td class="n vm">${brl(d.naoPago)}
             <tr class=tot><td>Total<td class=n>${brl(d.total)}
           </tbody></table>`;
    el('modalRoberta').showModal();
}

const VIS_CATEGORIAS = {
    Roberta: {
        categoria: 'Roberta', titulo: 'Roberta', subAberto: 'falta pra quitar com ela',
        subEncerrado: 'quitado — nada a pagar', legendaUsado: 'Você já pagou',
        rotuloEntrada: 'Ela te pagou', rotuloSaida: 'Você já pagou',
        rotuloSaldo: 'Falta', rotuloExcesso: 'Pagou a mais',
    },
    EntradaEcon: {
        categoria: 'Entrada Econ', titulo: 'Entrada Econ',
    },
    EvolucaoObra: {
        categoria: 'Evolução Obra', titulo: 'Evolução Obra',
    },
    DividaEstudantil: {
        categoria: 'Dívida Estudantil', titulo: 'Dívida Estudantil',
    },
    RenegociacaoPj: {
        categoria: 'Renegociação PJ', titulo: 'Renegociação PJ',
    },
    Emprestimo: {
        categoria: 'Empréstimo', titulo: 'Empréstimo',
    },
    Pos: {
        campo: 'nome', valor: 'Pós', titulo: 'Pós',
    },
    RenegociacaoNu: {
        campo: 'nome', valor: 'Renegociação Nu', titulo: 'Renegociação Nu',
    },
    Iphone: {
        campo: 'nome', valor: 'Iphone', titulo: 'Iphone', somenteNegativos: true,
    },
    SeguroResidencial: {
        campo: 'nome', valor: 'Seguro Residencial', titulo: 'Seguro Residencial',
    },
    Senac: {
        campo: 'nome', valor: 'Senac', titulo: 'Senac',
    },
};

el('btRoberta').onclick = () => abrirVisCategoria(VIS_CATEGORIAS.Roberta);
el('btEntradaEcon').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.EntradaEcon);
el('btEvolucaoObra').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.EvolucaoObra);
el('btDividaEstudantil').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.DividaEstudantil);
el('btRenegociacaoPj').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.RenegociacaoPj);
el('btEmprestimo').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Emprestimo);
el('btPos').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Pos);
el('btRenegociacaoNu').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.RenegociacaoNu);
el('btIphone').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Iphone);
el('btSeguroResidencial').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.SeguroResidencial);
el('btSenac').onclick = () => abrirVisPagamentoCategoria(VIS_CATEGORIAS.Senac);
el('fechaRoberta').onclick = () => el('modalRoberta').close();
el('modalRoberta').addEventListener('click', e => { if (e.target == el('modalRoberta')) el('modalRoberta').close(); });

// ===================================================================
// GRÁFICO DE GASTOS DO CICLO (pizza)
// ===================================================================
// Regra: total = soma de TUDO positivo no ciclo (renda, sem selecao manual).
// Fatias = cada categoria com saldo negativo no ciclo (gasto), com a linha
// sintetica "Fatura do cartão" contando como a categoria "Fatura do cartão", e o
// Resgate necessario / Aporte sugerido do ciclo contando como renda / categoria
// "Investimento", igual um resgate/aporte real contaria.
// O usuario pode excluir categorias especificas da pizza via multi-select.
let graficoChart = null;
let excluidasDoGrafico = [];

function dadosDoGraficoCiclo(idxPeriodo) {
    const periodo = Estado.ciclos[idxPeriodo];
    const visiveis = Estado.lancamentos.filter(r =>
        passaFiltroTriEstado('fativo', r.ativo) && passaFiltroTriEstado('fpago', r.pago)
    );
    const doPeriodo = visiveis.filter(r =>
        r.periodoIdx == idxPeriodo && !r.cred && !ehTransferenciaFatura(r));


    // A fatia BRUTA do unico cartao mostra onde o dinheiro foi gasto, e antecipar
    // e' so a forma de pagar — quem paga a fatura inteira nao gastou menos.
    const creditosDoPeriodo = Estado.lancamentos.filter(r => r.periodoIdx == idxPeriodo && r.cred);
    const totalFatura = creditosDoPeriodo.reduce((s, r) => s + r.v, 0);
    const ajuste = ajusteDoCicloContaUnica(idxPeriodo);
    const linhas = [
        ...doPeriodo,
        totalFatura ? { categ: 'Fatura do cartão', v: totalFatura } : null,
        ajuste ? { categ: ajuste.categ, v: ajuste.v } : null,
    ].filter(Boolean);

    const renda = linhas.filter(r => r.v > 0).reduce((s, r) => s + r.v, 0);
    const porCategoria = {};
    linhas.filter(r => r.v < 0).forEach(r => {
        const cat = textoOuTraco(r.categ);
        porCategoria[cat] = (porCategoria[cat] || 0) + (-r.v);
    });
    return { periodo, renda, porCategoria };
}

// clique numa celula da matriz Comparar (categoria x periodo): abre o detalhamento dos
// lancamentos individuais (nome + valor) que somam aquele total. Estado._detalheComparar.
// matriz e' preenchido em vComp() a cada redesenho; Estado._detalheAtual guarda as linhas
// e a ordenacao ativa do modal aberto, pra sortDetalheCel() poder reordenar sem reabrir.
window.abrirDetalheCelComparar = (categoria, periodoIdx) => {
    const info = Estado._detalheComparar;
    if (!info) return;
    const linhas = info.matriz[categoria + '||' + periodoIdx] || [];

    Estado._detalheAtual = { categoria, periodoIdx, linhas, ord: { k: 'data', d: 2 } };   // padrao: mais recente primeiro
    renderizaDetalheCel();
    el('modalDetalheCel').showModal();
};

// redesenha a mini-tabela do modal de detalhamento com a ordenacao atual de Estado._detalheAtual.ord
function renderizaDetalheCel() {
    const info = Estado._detalheAtual;
    if (!info) return;
    const { categoria, periodoIdx, linhas, ord } = info;
    const periodo = Estado.ciclos[periodoIdx];

    el('tituloDetalheCel').textContent = categoria;
    el('subDetalheCel').textContent =
        `${nomePeriodo(periodo.fat)} · ${linhas.length} ${linhas.length == 1 ? 'lançamento' : 'lançamentos'}`;

    const seta = k => ord.k == k ? (ord.d == 1 ? ' <span class=ar>↑</span>' : ' <span class=ar>↓</span>') : '';
    const valorOrd = { data: r => timestamp(r.data), nome: r => semAcento(r.nome ?? ''), valor: r => r.v };
    const ordenadas = [...linhas].sort((a, b) => {
        const A = valorOrd[ord.k](a), B = valorOrd[ord.k](b);
        const cmp = typeof A == 'string' ? A.localeCompare(B, 'pt') : A - B;
        return ord.d == 1 ? cmp : -cmp;
    });

    const total = linhas.reduce((s, r) => s + r.v, 0);
    el('corpoDetalheCel').innerHTML =
        `<table><thead><tr>` +
        `<th onclick="sortDetalheCel('data')">Data${seta('data')}` +
        `<th onclick="sortDetalheCel('nome')">Nome${seta('nome')}` +
        `<th class=n onclick="sortDetalheCel('valor')">Valor${seta('valor')}` +
        `</thead><tbody>` +
        ordenadas.map(r => `<tr><td>${r.data ? dataBR(r.data) : '—'}<td>${escapeHtml(r.nome ?? '')}${celValor(r.v)}`).join('') +
        `<tr class=tot><td colspan=2>Total${celSoma(total)}</tbody></table>`;
}

// clique no header da mini-tabela do modal: mesma logica de sortComp (1o clique ordena
// desc — mais relevante primeiro — clique de novo alterna asc/desc)
window.sortDetalheCel = k => {
    const ord = Estado._detalheAtual.ord;
    if (ord.k != k) { ord.k = k; ord.d = 2; }
    else ord.d = ord.d == 1 ? 2 : 1;
    renderizaDetalheCel();
};

el('fechaDetalheCel').onclick = () => el('modalDetalheCel').close();
el('modalDetalheCel').addEventListener('click', e => { if (e.target == el('modalDetalheCel')) el('modalDetalheCel').close(); });

window.abrirGraficoGastos = idxPeriodo => {
    const { periodo, renda, porCategoria } = dadosDoGraficoCiclo(idxPeriodo);
    const todasCategorias = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
    excluidasDoGrafico = excluidasDoGrafico.filter(c => todasCategorias.includes(c));

    el('graficoSubtitulo').textContent = `${nomePeriodo(periodo.fat)} · Renda do ciclo: ${brl(renda)}`;
    montaExcluirCatDrop(todasCategorias);
    desenhaGraficoPizza(idxPeriodo);
    el('modalGrafico').showModal();
};

function montaExcluirCatDrop(categorias) {
    el('excluirCatDrop').innerHTML = categorias.map(c =>
        `<label><input type=checkbox value="${c}" ${excluidasDoGrafico.includes(c) ? '' : 'checked'} onchange="toggleCategoriaGrafico('${c}',this.checked)">${c}</label>`
    ).join('');
    atualizaBotaoExcluirCat();
}
function atualizaBotaoExcluirCat() {
    const n = excluidasDoGrafico.length;
    el('excluirCatBtn').textContent = n == 0 ? 'Nenhuma excluída' : `${n} excluída${n > 1 ? 's' : ''}`;
}
// checkbox MARCADO = categoria incluida na pizza; desmarcar exclui
window.toggleCategoriaGrafico = (categoria, incluida) => {
    excluidasDoGrafico = incluida
        ? excluidasDoGrafico.filter(c => c !== categoria)
        : [...excluidasDoGrafico, categoria];
    atualizaBotaoExcluirCat();
    const idxAtual = el('modalGrafico').dataset.periodoIdx;
    desenhaGraficoPizza(+idxAtual);
};
el('excluirCatBtn').onclick = () => el('excluirCatDrop').classList.toggle('open');
document.addEventListener('click', e => {
    if (!e.target.closest('#excluirCatWrap')) el('excluirCatDrop').classList.remove('open');
});

const CORES_PIZZA = [
    '#8B84F5',
    '#35B982',
    '#E06B3C',
    '#D95C86',
    '#4B9BE8',
    '#F0A83A',
    '#79AE3A',
    '#92989D',
    '#C04A4A',
    '#A84F73'
];

function desenhaGraficoPizza(idxPeriodo) {
    el('modalGrafico').dataset.periodoIdx = idxPeriodo;
    const { renda, porCategoria } = dadosDoGraficoCiclo(idxPeriodo);
    const categorias = Object.keys(porCategoria)
        .filter(c => !excluidasDoGrafico.includes(c))
        .sort((a, b) => porCategoria[b] - porCategoria[a]);
    const valores = categorias.map(c => porCategoria[c]);

    el('graficoVazio').hidden = categorias.length > 0;
    el('canvasGraficoGastos').style.display = categorias.length ? 'block' : 'none';
    if (!categorias.length) { if (graficoChart) { graficoChart.destroy(); graficoChart = null } return; }

    const cores = categorias.map((_, i) => CORES_PIZZA[i % CORES_PIZZA.length]);
    if (graficoChart) graficoChart.destroy();
    graficoChart = new Chart(el('canvasGraficoGastos'), {
        type: 'pie',
        data: { labels: categorias, datasets: [{ data: valores, backgroundColor: cores, borderColor: '#FFF', borderWidth: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 14 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = valores.reduce((a, b) => a + b, 0);
                            const pctRenda = renda ? (ctx.parsed / renda * 100).toFixed(1) : '0.0';
                            const pctGasto = total ? (ctx.parsed / total * 100).toFixed(1) : '0.0';
                            return `${ctx.label}: ${brl(ctx.parsed)} · ${pctGasto}% dos gastos · ${pctRenda}% da renda`;
                        }
                    }
                }
            }
        }
    });
}

el('fechaGrafico').onclick = () => el('modalGrafico').close();
el('modalGrafico').addEventListener('click', e => {
    if (e.target == el('modalGrafico')) el('modalGrafico').close();
});

// ===================================================================
// GRÁFICO DE EVOLUÇÃO (Comparar) — ganho x gasto x aportado x resgatado, mês a mês
// ===================================================================
// Regra por período:
//   Ganho     = soma dos positivos, exceto categoria Investimento (nao inclui Resgate
//               real nem o Resgate necessario hipotetico)
//   Aportado  = soma dos negativos DA categoria Investimento (invertido pra positivo),
//               incluindo o Aporte sugerido do ciclo (se houver)
//   Resgatado = soma dos positivos DA categoria Investimento, incluindo o Resgate
//               necessario hipotetico do ciclo (se houver)
//   Gasto     = soma dos negativos, exceto categoria Investimento (nao inclui Aporte
//               real nem o Aporte sugerido hipotetico)
let graficoEvolucaoChart = null;

function dadosEvolucao(de, ate) {
    const periodosUsados = [];
    for (let i = de; i <= ate; i++) if (Estado.ciclos[i]) periodosUsados.push(i);

    const { base, abat } = baseEAbatFiltrados();

    const porPeriodo = periodosUsados.map(i => {
        // compras no CREDITO nao entram uma a uma: o que sai da conta no mes e' a fatura
        // LIQUIDA (bruto + antecipacao ja paga), a mesma linha sintetica que o bloco Debito
        // da visao Ciclo mostra. Somar o bruto de cada compra inflava o Gasto pela
        // antecipacao — ex: R$5.008,42 em compras que viram R$3.026,14 a pagar.
        //
        // A ANTECIPACAO de fatura entra normalmente (regime de caixa): ela saiu da conta
        // NESTE mes, entao conta como gasto aqui — e a fatura que ela quita ja vem abatida
        // do mesmo valor (alocacaoAntecipacoes), no mes seguinte. Sem dupla contagem: o
        // desembolso aparece uma vez, no mes em que aconteceu. Excluir a antecipacao (como
        // a pizza de categorias faz, onde ela e' transferencia e nao gasto) sumia com o
        // dinheiro do grafico — nem no mes do pagamento nem no da fatura.
        const linhas = base.filter(r => r.periodoIdx == i && !r.cred);
        const investimento = linhas.filter(r => r.inv);
        const resto = linhas.filter(r => !r.inv);

        // guarda as linhas que compoem cada barra (nao so o total) pra o clique na barra
        // poder abrir o detalhamento item a item — sem isso, uma divergencia entre o
        // grafico e a soma manual do bloco Debito nao tem como ser conferida na tela.
        const linhasDe = {
            Ganho: resto.filter(r => r.v > 0),
            Gasto: resto.filter(r => r.v < 0),
            Resgatado: investimento.filter(r => r.v > 0),
            Aportado: investimento.filter(r => r.v < 0),
        };

        // uma linha da unica fatura detalhada, liquida de antecipacao (mesmo criterio de
        // vCiclo: fatura ja quitada — liquido ~0 — nao vira linha nenhuma)
        const brutoFatura = base
            .filter(r => r.cred && r.periodoIdx == i)
            .reduce((s, r) => s + r.v, 0);
        if (brutoFatura) {
            const liquido = brutoFatura + (abat[i] || 0);
            if (Math.abs(liquido) >= 0.005) {
                linhasDe[liquido < 0 ? 'Gasto' : 'Ganho'].push({
                    data: vencimentoDoCiclo(i), nome: 'Fatura do cartão', categ: 'Fatura', v: liquido,
                });
            }
        }

        // o Resgate necessario / Aporte sugerido do ciclo entra como uma linha sintetica na
        // barra correspondente, do mesmo jeito que aparece no bloco Debito da visao Ciclo
        const ajuste = ajusteDoCiclo(i);
        if (ajuste) {
            linhasDe[ajuste.tipo == 'resgate' ? 'Resgatado' : 'Aportado'].push({
                data: dataISO(Estado.ciclos[i].fat), nome: ajuste.nome, categ: ajuste.categ, v: ajuste.v,
            });
        }

        const soma = k => linhasDe[k].reduce((s, r) => s + Math.abs(r.v), 0);
        return {
            nome: nomePeriodo(Estado.ciclos[i].fat), periodoIdx: i, linhasDe,
            ganho: soma('Ganho'), gasto: soma('Gasto'),
            aportado: soma('Aportado'), resgatado: soma('Resgatado'),
        };
    });
    return porPeriodo;
}

window.abrirGraficoEvolucao = (de, ate) => {
    const dados = dadosEvolucao(de, ate);
    desenhaGraficoEvolucao(dados);
    el('modalComparativo').showModal();
};

function desenhaGraficoEvolucao(dados) {
    if (graficoEvolucaoChart) graficoEvolucaoChart.destroy();
    graficoEvolucaoChart = new Chart(el('canvasEvolucao'), {
        type: 'bar',
        data: {
            labels: dados.map(d => d.nome),
            // duas colunas por mes, cada uma empilhando duas barras:
            //   entrada = Ganho (verde) + Resgatado (azul) em cima  -> tudo que entrou na conta
            //   saida   = Gasto (vermelho) + Aportado (laranja) em cima -> tudo que saiu
            // com as duas na mesma altura, o mes fechou equalizado — da' pra ver de relance.
            datasets: [
                { label: 'Ganho', data: dados.map(d => d.ganho), backgroundColor: '#35B982', stack: 'entrada' },
                { label: 'Resgatado', data: dados.map(d => d.resgatado), backgroundColor: '#4C9BE8', stack: 'entrada' },
                { label: 'Gasto', data: dados.map(d => d.gasto), backgroundColor: '#E95F59', stack: 'saida' },
                { label: 'Aportado', data: dados.map(d => d.aportado), backgroundColor: '#F0A83A', stack: 'saida' },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const renda = dados[ctx.dataIndex].ganho;
                            const valor = ctx.parsed.y;
                            // % da renda: so faz sentido pra Gasto e Aportado (Ganho e' a propria renda, sempre 100%)
                            if (ctx.dataset.label == 'Ganho') return `Ganho: ${brl(valor)}`;
                            const pct = renda ? (valor / renda * 100).toFixed(1) : '—';
                            return `${ctx.dataset.label}: ${brl(valor)} · ${pct}% da renda`;
                        }
                    }
                },
            },
            // `stacked` nos dois eixos e' o que faz o `stack` dos datasets valer: sem isso o
            // Chart.js ignora os grupos e desenha as 4 barras lado a lado.
            scales: {
                x: { stacked: true },
                y: { stacked: true, ticks: { callback: v => brl(v) } },
            },
            // clique numa barra abre o detalhamento item a item daquela barra (mesmo modal
            // do clique numa celula da matriz Comparar), pra dar pra conferir de onde vem
            // cada total — e bater com a soma manual do bloco Debito quando divergirem.
            onClick: (_evt, elementos) => {
                if (!elementos.length) return;
                const { datasetIndex, index } = elementos[0];
                const rotulo = graficoEvolucaoChart.data.datasets[datasetIndex].label;
                abrirDetalheBarraEvolucao(dados[index], rotulo);
            },
        },
    });
    el('canvasEvolucao').style.cursor = 'pointer';
}

// detalhamento de uma barra do grafico de evolucao: reaproveita o modal (e a tabela
// ordenavel) do detalhamento de celula da matriz Comparar.
function abrirDetalheBarraEvolucao(dadoDoPeriodo, rotulo) {
    Estado._detalheAtual = {
        categoria: rotulo,
        periodoIdx: dadoDoPeriodo.periodoIdx,
        linhas: dadoDoPeriodo.linhasDe[rotulo] || [],
        ord: { k: 'valor', d: 2 },   // maior primeiro: e' o que ajuda a achar a divergencia
    };
    renderizaDetalheCel();
    el('modalDetalheCel').showModal();
}

el('fechaComparativo').onclick = () => el('modalComparativo').close();
el('modalComparativo').addEventListener('click', e => {
    if (e.target == el('modalComparativo')) el('modalComparativo').close();
});

// ===================================================================
// NOVO LANÇAMENTO (modal de insercao) — otimizado pra cadastro rapido:
// foco automatico, navegacao por Enter, busca de categoria por nome
// parecido, categorias ordenadas por uso recente, modal fica aberto
// apos salvar (pronto pro proximo).
// ===================================================================
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

function idsFaturasDoFormulario() {
    return [...document.querySelectorAll('[data-fatura-parcela]')]
        .map(select => select.value ? +select.value : null);
}

// Credito nao tem mais inferencia por fechamento: cada parcela recebe sua fatura
// explicitamente. Assim uma compra 3x pode apontar para tres faturas diferentes sem
// depender de datas calculadas no frontend.
// Antecipacao de fatura (debito) tambem exige uma fatura explicita — pra que o
// abatimento seja preciso (vai direto na fatura certa, sem depender de ordem cronologica).
function atualizarFaturasDoFormulario(idsSelecionados = idsFaturasDoFormulario()) {
    const wrap = el('fFaturasWrap');
    const destino = el('faturasPorParcela');
    const cred = el('fCred').checked;
    const categ = el('fCateg').value || '';
    const ehAntecip = ehAntecipacaoFatura(categ);
    wrap.hidden = !cred && !ehAntecip;
    if (!cred && !ehAntecip) { destino.innerHTML = ''; return; }

    const parcelas = +el('fParcelas').value || 1;
    if (!Estado.faturas.length) {
        destino.innerHTML = '<p class=avisoFr>Cadastre a fatura no DataGrip ou aplique a permissão de leitura antes de lançar crédito.</p>';
        return;
    }

    const opcoes = Estado.faturas.map(f =>
        `<option value="${f.id}">${escapeHtml(nomeFatura(f))}</option>`
    ).join('');
    destino.innerHTML = Array.from({ length: parcelas }, (_, parcela) => {
        const selecionada = idsSelecionados[parcela];
        const titulo = parcelas > 1 ? `Parcela ${parcela + 1}` : 'Fatura';
        return `<label class=fm><span>${titulo} <b class=req>*</b></span>` +
            `<select data-fatura-parcela="${parcela}" required>` +
            `<option value="" disabled${selecionada ? '' : ' selected'}>Selecione a fatura…</option>` +
            opcoes +
            '</select></label>';
    }).join('');

    [...document.querySelectorAll('[data-fatura-parcela]')].forEach((select, parcela) => {
        if (idsSelecionados[parcela] && Estado.faturas.some(f => +f.id === +idsSelecionados[parcela])) {
            select.value = String(idsSelecionados[parcela]);
        }
    });
}

el('fCred').addEventListener('change', () => {
    sugereModoValorParcelas();
    atualizarFaturasDoFormulario();
});

// quando a categoria muda pra "Antecipacao Fatura" (debito), o seletor de fatura
// deve aparecer igual ao credito — e desaparecer se sair dessa categoria.
el('fCateg').addEventListener('change', () => atualizarFaturasDoFormulario());

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
    el('fIsaWrap').hidden = Estado.restrito;   // Isabella nao lanca "pra" Isabella, ja e' o padrao dela

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
        atualizarFaturasDoFormulario(prefill.fatura_id ? [prefill.fatura_id] : []);
        el('fIsa').checked = !!prefill.isa;
        el('fPago').checked = prefill.pago !== false;   // so' desmarca se for explicitamente false
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
    const tokens = calcTokeniza(expr.replace(/(\d)\.(?=\d{3}(\D|$))/g, '$1').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/'));
    if (!tokens.length) return null;

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
// - Aporte sugerido/Resgate necessario: Materializar grava imediatamente o ajuste real,
//   em debito e aberto, preservando data, valor e categoria.
el('seldup').onclick = async () => {
    const chave = [...Estado.selecionados.keys()][0];
    if (chave && /^(sug|res):/.test(chave)) {
        const ajuste = linhaDaChaveSelecao(chave);
        if (!ajuste || (ajuste._sug == null && !ajuste._res) || el('seldup').disabled) return;

        el('seldup').disabled = true;
        el('seldup').textContent = 'Materializando…';
        try {
            const ehAporte = chave.startsWith('sug:');
            const data = dataISO(ajuste.data) || null;
            const linhaCriada = await inserirLancamento({
                data,
                freq: null,
                cred: false,
                isa: Estado.restrito,
                pago: false,
                ativo: true,
                nome: ehAporte ? 'Aporte' : 'Resgate',
                categ: ajuste.categ,
                valor: ajuste._sug != null ? ajuste._sug : ajuste.v,
            });
            const periodoIdx = data ? periodoDoDebito(data) : null;
            Estado.lancamentos.push({
                ...linhaCriada,
                v: +linhaCriada.valor || 0,
                inv: /^investimento$/i.test(String(linhaCriada.categ || '').trim()),
                periodoIdx: periodoIdx != null && periodoIdx >= 0 && periodoIdx < Estado.ciclos.length ? periodoIdx : null,
            });
            Estado.selecionados.clear();
            desenhar();
        } catch (err) {
            alert('Falhou ao materializar o ajuste: ' + err.message);
        } finally {
            el('seldup').disabled = false;
            el('seldup').textContent = /^(sug|res):/.test(chave) ? 'Materializar' : 'Duplicar';
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
        alert('Falhou ao excluir: ' + err.message);
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
    const isa = el('fIsaWrap').hidden ? Estado.restrito : el('fIsa').checked;
    const pago = el('fPago').checked;
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
        if (Estado.simulando) simulaLancamentoParcelado({ nome, categ, freq, data, cred, isa, pago, parcelas, valores, faturaIds });
        else await salvaLancamentoParceladoNoBanco({ nome, categ, freq, data, cred, isa, pago, parcelas, valores, faturaIds });

        // sucesso: NAO fecha o modal. Limpa so valor/data, mantem nome/categoria/cred/isa
        // pro proximo lancamento da mesma sessao (ex: varios itens do mesmo mercado).
        const totalAssinado = valores.reduce((s, v) => s + v, 0);
        el('erroNovo').textContent = (Estado.simulando ? 'Simulado: ' : 'Salvo: ') +
            (parcelas > 1 ? `${parcelas}x ${brl(Math.abs(valores[0]))} · ${brl(Math.abs(totalAssinado))} no total` : brl(totalAssinado));
        el('erroNovo').classList.add('ok');
        el('fNome').value = '';
        el('fValor').value = ''; sinalPositivo = false; atualizaSinalUI();
        el('fData').value = hojeISO();
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
async function salvaLancamentoParceladoNoBanco({ nome, categ, freq, data, cred, isa, pago, parcelas, valores, faturaIds = [] }) {
    const ehAntecip = ehAntecipacaoFatura(categ || '');
    for (let p = 0; p < parcelas; p++) {
        const dataParcela = data ? dataDaOcorrencia(data, p, freq) : null;
        const payload = {
            data: dataParcela, freq, cred, isa, pago, ativo: true,
            nome,
            // credito usa fatura_id; antecipacao de debito tambem (vinculo explicito com a fatura quitada)
            categ, valor: valores[p], fatura_id: (cred || ehAntecip) ? faturaIds[p] : null,
        };
        const linhaCriada = await inserirLancamento(payload);
        const periodoIdx = !dataParcela ? null
            // antecipacao e' debito: periodo determinado pela propria data, nao pelo vencimento da fatura
            : cred ? periodoDaFatura(faturaIds[p]) : periodoDoDebito(dataISO(dataParcela));
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
        ? 'Modo simulação ATIVO — clique pra desligar (apaga os lançamentos simulados)'
        : 'Modo simulação: injeta lançamentos hipotéticos só na memória (nunca salva) — recarregar ou desligar apaga tudo';
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
function simulaLancamentoParcelado({ nome, categ, freq, data, cred, isa, pago, parcelas, valores, faturaIds = [] }) {
    const grupoSimulado = ++Estado._proxIdSimulado;   // contador curto, so' pra diferenciar cada "compra simulada" das outras
    const ehAntecip = ehAntecipacaoFatura(categ || '');

    const criadas = valores.map((valorAssinado, p) => {
        const dataParcela = data ? dataDaOcorrencia(data, p, freq) : null;
        const periodoIdx = !dataParcela ? null
            : cred ? periodoDaFatura(faturaIds[p]) : periodoDoDebito(dataISO(dataParcela));
        return {
            id: `sim-${grupoSimulado}-${p}`,
            nome,
            categ, freq, data: dataParcela,
            cred, isa, pago, ativo: true, fatura_id: (cred || ehAntecip) ? faturaIds[p] : null,
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
const sb = supabase.createClient(API, KEY);
const mostraTela = logado => {
    el('login').style.display = logado ? 'none' : 'flex';
    el('app').style.display = logado ? 'block' : 'none';
};

// ao abrir a pagina: se ja existe sessao salva, entra direto; senao mostra o login
async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        Estado.restrito = (session.user.email || '').toLowerCase() == EMAIL_ISABELLA.toLowerCase();
        aplicaPerfil(); mostraTela(1); load();
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

    Estado.restrito =
        (data.session.user.email || '').toLowerCase() ==
        EMAIL_ISABELLA.toLowerCase();

    aplicaPerfil();
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
