# Regras dos lançamentos

Este arquivo é a referência de comportamento financeiro da aplicação. `AGENTS.md` explica o processo de manutenção; não substitui estas regras.

## Convenções gerais

- `fin.valor` é assinado: entradas são positivas e despesas são negativas. Relatórios podem exibir despesas como valor absoluto, mas os cálculos mantêm o sinal original.
- Uma linha real possui `id` positivo e pode ser persistida. Linhas de fatura, saldo anterior, aporte/resgate sugerido e simulações são derivadas; nunca podem ser editadas ou excluídas diretamente no banco.
- O filtro ativo, pago, origem, titular e sinal define o recorte das tabelas e dos cálculos que explicitamente usam `filtrarLancamentos()`. Visões especiais identificadas na interface como acompanhamento total ignoram o recorte de propósito.
- Simulação existe somente em memória: não cria, atualiza ou exclui linhas no Supabase e desaparece ao recarregar ou desativar o modo.
- A carga valida o formato dos lançamentos de forma somente diagnóstica. Inconsistências dos registros aparecem em modal; lentidão e falhas operacionais aparecem em toast no canto inferior direito. Nada é corrigido, descartado ou gravado automaticamente. O Console mantém apenas uma linha resumida de métricas por carga.

## Faturas

- As faturas existentes são derivadas das datas `fatura` já usadas nos lançamentos; a aplicação não usa uma tabela `faturas`.
- Todo lançamento novo com `cred = true` deverá receber `fatura` escolhida manualmente. O total da fatura nunca é gravado: é a soma dos `fin.valor` ligados a ela.
- Ao cadastrar ou simular uma venda no crédito, cada prestação mostra como sugestão a fatura disponível mais próxima da data daquela prestação (ou a última conhecida se a data a ultrapassar). A sugestão não é regra: cada seletor continua editável e uma escolha manual nunca é substituída.
- `periodos` não é lida pela aplicação. Ela permanece temporariamente apenas como histórico para auditoria da migração dos créditos e poderá ser removida depois da conferência.
- Cada lançamento `Faturamento PJ` abre um ciclo de débito. O ciclo vai dessa data até o dia anterior ao próximo `Faturamento PJ`; uma fatura entra no ciclo que contém seu `vencimento`.
- No modo Ciclo, o bloco Débito e seus cálculos continuam na competência atual. Somente a tabela Crédito é uma prévia visual: no ciclo N ela mostra os créditos da competência N+1.
- O total no título dessa prévia de Crédito usa os mesmos filtros e abatimentos por antecipação da linha dinâmica da fatura; a tabela abaixo continua detalhando as compras brutas.

- Existe um único cartão detalhado. Todo lançamento com `cred = true` aponta para `fatura`; `isa` não seleciona outro calendário de cartão.
- A fatura da Isabella é um lançamento real comum: `cred = false`, `isa = true`, valor negativo e `pago` indicando Aberto/Pago. Pode começar com um valor máximo estimado e receber `UPDATE` no mesmo lançamento quando o total fechar.
- A fatura da Isabella não é criada como linha sintética, não é calculada pela soma de compras e não participa da alocação de antecipações do cartão detalhado.
- O campo `isa` identifica lançamentos da Isabella para filtros e é escolhido explicitamente no formulário; ele não muda a interface conforme o e-mail da sessão.
- Antecipações de fatura abatem somente a única fatura detalhada, da mais antiga para a mais nova.

## Aportes e resgates

- Ao agir sobre um `Aporte sugerido` ou `Resgate necessário`, o aplicativo procura um lançamento real de `Aporte` ou `Resgate`, na categoria `Investimento`, dentro do mesmo ciclo.
- Sem movimento real no ciclo, a ação materializa uma nova linha aberta. Com movimento real, a ação passa a ser `Consolidar` e faz `UPDATE` nessa linha: valores do mesmo sentido somam e valores opostos se abatem. Se houver inversão de sinal, o nome passa a refletir o movimento que restou.
- Se o abatimento zerar o valor, a linha existente é mantida com valor zero; a ação não exclui lançamentos automaticamente.

## Ciclos, saldo e gráficos

- Cada ciclo começa em um `Faturamento PJ` e termina no dia anterior ao próximo. Lançamentos sem data ou sem ciclo válido ficam no Backlog.
- O saldo de um ciclo carrega o saldo anterior, os débitos e a fatura líquida. A antecipação de fatura é transferência: reduz o saldo devido da fatura, mas não cria uma segunda despesa nas análises de gasto.
- Se houver déficit, o `Resgate necessário` é limitado ao patrimônio disponível. Se houver excedente, o `Aporte sugerido` absorve o excedente. Ambos são linhas sintéticas até serem materializados/consolidados pelo usuário.
- A pizza de gastos usa o ciclo inteiro e mostra despesas por categoria, incluindo a fatura bruta. Antecipar fatura não reduz a fatia, porque só altera a forma de pagamento.

## Visualizações de acompanhamento

- A visão Roberta considera somente lançamentos ativos e pagos da categoria: entradas positivas formam o crédito e saídas negativas o consomem. O percentual para em 100%, mas o saldo ainda informa eventual pagamento excedente.
- As visualizações de pagamento por categoria ou nome consideram lançamentos ativos, pagos e abertos; usam valor absoluto para comparar pago, pendente e total. A visão Iphone limita-se a saídas negativas.

## Mobile

- No mobile, as tabelas são somente leitura. Não há seleção de linhas, edição inline, alternância de status, duplicação, exclusão ou atualização por toque.
- No mobile, `modoSimples` mostra um ciclo por vez e não exibe o bloco Crédito. A fatura líquida permanece no cálculo do Débito.
- O cadastro de novo lançamento permanece disponível; a tela compacta mantém apenas navegação, consulta e esse cadastro como fluxos de trabalho.

## Migrations

- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- `migrations/01-nao-volatil-lancamentos.sql` e `migrations/02-volatil-lancamentos.sql` permanecem somente como histórico das alterações já aplicadas.
- `migrations/03-remover-fatura-isabella-periodos.sql` registra a remoção de `periodos.fecha_isa` e `periodos.venc_isa`. Ela é idempotente porque essas colunas podem já ter sido removidas diretamente no banco.
- `migrations/04-remover-volatil-lancamentos.sql` remove definitivamente a flag `volatil`, ausente da tabela atual `fin`. O aplicativo não exibe, filtra, grava nem atualiza essa flag.
- `migrations/05-faturas-db-first.sql` registra o modelo anterior de `faturas`; as migrations 10 e 11 o substituem pela coluna atual `fin.fatura`, sem tabela de faturas. Nenhum valor de fatura é calculado ou armazenado no banco.
- `migrations/06-exigir-fatura-no-credito.sql` registra a validação que mantém crédito e débito coerentes com a fatura escolhida.
- `migrations/13-renomear-lancamentos-para-fin.sql` renomeia a tabela técnica `public.lancamentos` para `public.fin` sem copiar ou alterar registros; nomes antigos permanecem apenas no histórico das migrations e no vocabulário financeiro.
- `migrations/14-renomear-colunas-fin.sql` renomeia `fin.fatura_venc` para `fin.fatura` e `fin.reserva_emergencia` para `fin.reserva`, preservando todos os valores e recarregando o cache de schema da API.

## Testes

- Os estilos são carregados em camadas por `css/base.css`, `css/dashboard.css`, `css/forms.css`, `css/charts.css`, `css/utilities.css` e `css/mobile.css`; o responsivo permanece por último para preservar a cascata. A estrutura é coberta por `node --test tests/estrutura-estilos.test.js`.
- A estrutura em arquivos clássicos carrega `js/app-state.js`, `js/domain.js`, `js/shared.js`, `js/supabase-api.js`, `js/finance.js`, `js/data-ui.js`, `js/tables.js`, `js/cycle-views.js`, `js/interactions.js`, `js/charts.js`, `js/form.js` e `js/bootstrap.js` nessa ordem. Estado/configuração, validação de domínio, utilitários, Supabase, cálculos financeiros, carregamento, tabelas, visões, comandos, gráficos, formulário e inicialização ficam em módulos próprios. A separação é coberta por `node --test tests/estrutura-modulos.test.js`.
- O preenchimento sugerido das faturas em vendas simuladas é coberto por `node --test tests/faturas-simulacao.test.js`.
- A consolidação de aporte/resgate no mesmo ciclo é coberta por `node --test tests/materializacao-ajuste.test.js`.
- A meta de reserva emergência, calculada para os nove ciclos seguintes com valores previstos e estimados, é coberta por `node --test tests/meta-reserva-emergencia.test.js`.
- O cadastro e a alternância imediata da classificação Reserva emergência são cobertos por `node --test tests/reserva-emergencia-interacao.test.js`.
- O deslocamento visual de uma competência na tabela Crédito é coberto por `node --test tests/layout-creditos.test.js`.
- Datas, recorrências, normalização de texto e alocação de antecipações são cobertas por `node --test tests/shared-regras.test.js`.
- Aporte/resgate, saldo-base e total de Crédito são cobertos por `node --test tests/finance-regras.test.js`.
- Máscara monetária, calculadora e divisão exata de parcelas são cobertas por `node --test tests/form-regras.test.js`.
- A combinação dos filtros de tabelas é coberta por `node --test tests/tabelas-filtros.test.js`.
- O padrão de cabeçalhos explicativos em código, estilos, migrations, testes e regiões dinâmicas do HTML é coberto por `node --test tests/documentacao-estrutura.test.js`.
- O vocabulário financeiro e a validação não destrutiva da carga são cobertos por `node --test tests/domain-validacao.test.js`.
- A separação entre modal de inconsistências, toast operacional e resumo único de métricas no Console é coberta por `node --test tests/diagnosticos-interface.test.js`.
- `.editorconfig` padroniza edição futura, e `node scripts/check.mjs` bloqueia tabs, espaços finais e arquivos sem newline final; o contrato é coberto por `node --test tests/estilo-editorconfig.test.js`.
- A suíte inteira deve rodar com `node --test tests/*.test.js`. Ela é local e não cria lançamentos de teste nem valida uma sessão real do Supabase.

## Reserva emergência

- `fin.reserva` é a classificação existente no banco. A migration `migrations/12-renomear-essencial-para-reserva-emergencia.sql` registra o nome histórico anterior; a migration 14 usa o nome curto atual e preserva seus valores.
- O formulário mostra a caixa **Reserva emergência** desmarcada por padrão e novos lançamentos são salvos como `false` até ela ser marcada.
- Nas tabelas, o badge Reserva emergência é clicável para alternar a classificação de todos os lançamentos reais com o mesmo `nome` exato, em qualquer ciclo; a alteração é salva imediatamente. Em simulações, apenas as linhas simuladas com esse mesmo nome mudam em memória.
- O botão **Reserva emergência**, ao lado de **Gráfico**, mostra uma pizza de progresso. A meta soma os gastos negativos marcados como reserva emergência nos nove ciclos a partir do selecionado, respeitando os filtros ativos e excluindo transferências de pagamento/antecipação de fatura. Para cada nome, o valor cadastrado em um ciclo substitui o anterior; se não houver ocorrência cadastrada naquele ciclo, mantém-se o último valor conhecido como estimativa. O modal informa quantos ciclos contêm estimativas.
- O valor guardado da pizza usa `guardadoAte(ciclo)`, a mesma base exibida no título Débito; por isso ele soma tudo que já foi guardado até aquele ciclo.
