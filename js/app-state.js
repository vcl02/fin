// Configuração e estado compartilhado da aplicação.
// Este arquivo não manipula a tela nem chama o banco.
const API = 'https://yzmyncxoskvqzdczaill.supabase.co';
const KEY = 'sb_publishable_Fq984qUdQO8mGq4PSYmUiQ_ySaLrmEQ';
const EMAIL_ISABELLA = 'isabella.251200@gmail.com';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SALDO_INICIAL = 0;
const SALDO_DESDE = '2026-08-07';
const COLS = [
    ['data', 'Data', 'd'], ['nome', 'Nome', 't'], ['valor', 'Valor', 'n'],
    ['categ', 'Categoria', 't'], ['freq', 'Frequência', 't'], ['pago', 'Pago', 'b'],
    ['reserva_emergencia', 'Reserva emergência', 'r'], ['id', 'ID', 'n'],
];
const COLS_MOBILE = [['data', 'Data', 'd'], ['nome', 'Nome', 't'], ['valor', 'Valor', 'n']];
const isMobile = () => matchMedia('(max-width: 640px)').matches;
const colunasAtivas = () => isMobile() ? COLS_MOBILE : COLS;

const Estado = {
    ciclos: [], faturas: [], lancamentos: [], valorFaturaPorCiclo: {},
    selecionados: new Map(), ordenacaoPorTabela: {}, filtroTexto: {}, linhasVisiveis: {},
    fechados: {}, restrito: false, ordComp: { k: 'total', d: 2 }, simulando: false,
    _proxIdSimulado: 0,
};

const modoSimples = () => Estado.restrito || matchMedia('(max-width: 640px)').matches;
const estadoOrdenacao = id => Estado.ordenacaoPorTabela[id] || (Estado.ordenacaoPorTabela[id] = { k: 'data', d: 1 });
const estadoFiltroTexto = id => Estado.filtroTexto[id] || (Estado.filtroTexto[id] = {});
