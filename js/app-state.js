// Configuração e estado compartilhado da aplicação.
// Este arquivo não manipula a tela nem chama o banco.
// Configuração pública do cliente. A chave publicável identifica o projeto, mas não
// substitui as policies do banco; qualquer autorização continua sendo responsabilidade do RLS.
const API = 'https://yzmyncxoskvqzdczaill.supabase.co';
const KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
// Nome técnico da tabela financeira no banco. O domínio continua chamando cada registro de lançamento.
const TABELA_FIN = 'fin';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
// Marco histórico: ciclos anteriores não entram na cascata do saldo, para não misturar
// movimentos antigos que ainda não possuem base confiável de saldo inicial.
const SALDO_INICIAL = 0;
const SALDO_DESDE = '2026-08-07';
const COLS = [
    ['data', 'Data', 'd'], ['nome', 'Nome', 't'], ['valor', 'Valor', 'n'],
    ['categ', 'Categoria', 't'], ['freq', 'Frequência', 't'], ['pago', 'Pago', 'b'],
    ['reserva', 'Reserva emergência', 'r'], ['id', 'ID', 'n'],
];
const COLS_MOBILE = [['data', 'Data', 'd'], ['nome', 'Nome', 't'], ['valor', 'Valor', 'n']];
const isMobile = () => matchMedia('(max-width: 640px)').matches;
const colunasAtivas = () => isMobile() ? COLS_MOBILE : COLS;

// Único estado mutável da tela. Dados vindos do banco são normalizados em carregarDados;
// as flags iniciadas com "_" pertencem apenas à interface e nunca são persistidas.
const Estado = {
    ciclos: [], faturas: [], lancamentos: [], valorFaturaPorCiclo: {},
    selecionados: new Map(), ordenacaoPorTabela: {}, filtroTexto: {}, linhasVisiveis: {},
    fechados: {}, ordComp: { k: 'total', d: 2 }, simulando: false,
    _proxIdSimulado: 0,
};

const modoSimples = () => matchMedia('(max-width: 640px)').matches;
const estadoOrdenacao = id => Estado.ordenacaoPorTabela[id] || (Estado.ordenacaoPorTabela[id] = { k: 'data', d: 1 });
const estadoFiltroTexto = id => Estado.filtroTexto[id] || (Estado.filtroTexto[id] = {});
