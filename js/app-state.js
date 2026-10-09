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
    ['prio', 'Prio', 'n'], ['obs', 'Obs', 't'], ['canal', 'Canal', 't'], ['id', 'ID', 'n'],
];
// Mesmas colunas do desktop no mobile: a tabela já tinha rolagem horizontal própria
// (.wrap) pra telas estreitas, então não precisa de um recorte de colunas à parte. Prio é a
// única exceção de tabela: só faz sentido na fila de elevação do Backlog (ver
// estadoOrdenacao), então some nas demais (Débito, Crédito), onde a linha já tem ciclo — e,
// no Backlog, vem na FRENTE de tudo (inclusive Data), já que é o primeiro critério que
// importa ali: decidir o que elevar primeiro pra um ciclo.
const colunasAtivas = idTabela => idTabela === 'bk'
    ? [COLS.find(([chave]) => chave === 'prio'), ...COLS.filter(([chave]) => chave !== 'prio')]
    : COLS.filter(([chave]) => chave !== 'prio');
const isMobile = () => matchMedia('(max-width: 640px)').matches;

// Único estado mutável da tela. Dados vindos do banco são normalizados em carregarDados;
// as flags iniciadas com "_" pertencem apenas à interface e nunca são persistidas.
const Estado = {
    ciclos: [], faturas: [], lancamentos: [], valorFaturaPorCiclo: {}, emailSessao: null,
    selecionados: new Map(), ordenacaoPorTabela: {}, filtroTexto: {}, linhasVisiveis: {},
    fechados: {}, cicloQuitadoRecolhido: null, ordComp: { k: 'total', d: 2 }, simulando: false,
    _proxIdSimulado: 0,
};

// Única conta que enxerga a interface restrita: só Débito, só ciclo atual e próximo, somente
// leitura total (sem Crédito, Comparar, Visualizações, gráficos, cadastro ou edição nenhuma).
// A checagem é por e-mail da sessão — a mesma ideia que existia antes de ser removida, agora
// reintroduzida por pedido explícito do mantenedor. Vale em qualquer tela, não só no mobile:
// é uma restrição de CONTA, não de largura de tela.
const EMAIL_ISABELLA = 'isabella.251200@gmail.com';
const modoRestrito = () => String(Estado.emailSessao || '').trim().toLowerCase() === EMAIL_ISABELLA;
// "modoSimples" sempre foi o nome da casca simplificada (só Débito, sem filtros avançados);
// antes ela também entrava no mobile por largura de tela — agora o mobile tem paridade total
// com o desktop, e só a conta restrita continua vendo essa casca, em qualquer dispositivo.
const modoSimples = () => modoRestrito();
// Backlog ordena por padrão pela prioridade de elevação (1 = mais provável de entrar num
// ciclo, maior = menos chance); as demais tabelas continuam por data, como sempre.
const estadoOrdenacao = id => Estado.ordenacaoPorTabela[id] || (Estado.ordenacaoPorTabela[id] = { k: id === 'bk' ? 'prio' : 'data', d: 1 });
const estadoFiltroTexto = id => Estado.filtroTexto[id] || (Estado.filtroTexto[id] = {});
