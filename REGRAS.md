# Regras dos lançamentos

## Faturas

- As faturas existentes são derivadas das datas `fatura_venc` já usadas nos lançamentos; a aplicação não usa uma tabela `faturas`.
- Todo lançamento novo com `cred = true` deverá receber `fatura_venc` escolhido manualmente. O total da fatura nunca é gravado: é a soma dos `lancamentos.valor` ligados a ela.
- Ao cadastrar ou simular uma venda no crédito, cada prestação mostra como sugestão a fatura disponível mais próxima da data daquela prestação (ou a última conhecida se a data a ultrapassar). A sugestão não é regra: cada seletor continua editável e uma escolha manual nunca é substituída.
- `periodos` não é lida pela aplicação. Ela permanece temporariamente apenas como histórico para auditoria da migração dos créditos e poderá ser removida depois da conferência.
- Cada lançamento `Faturamento PJ` abre um ciclo de débito. O ciclo vai dessa data até o dia anterior ao próximo `Faturamento PJ`; uma fatura entra no ciclo que contém seu `vencimento`.
- No modo Ciclo, o bloco Débito e seus cálculos continuam na competência atual. Somente a tabela Crédito é uma prévia visual: no ciclo N ela mostra os créditos da competência N+1.
- O total no título dessa prévia de Crédito usa os mesmos filtros e abatimentos por antecipação da linha dinâmica da fatura; a tabela abaixo continua detalhando as compras brutas.

- Existe um único cartão detalhado. Todo lançamento com `cred = true` aponta para `fatura_venc`; `isa` não seleciona outro calendário de cartão.
- A fatura da Isabella é um lançamento real comum: `cred = false`, `isa = true`, valor negativo e `pago` indicando Aberto/Pago. Pode começar com um valor máximo estimado e receber `UPDATE` no mesmo lançamento quando o total fechar.
- A fatura da Isabella não é criada como linha sintética, não é calculada pela soma de compras e não participa da alocação de antecipações do cartão detalhado.
- O campo `isa` continua identificando lançamentos da Isabella para filtros e para a visão restrita.
- Antecipações de fatura abatem somente a única fatura detalhada, da mais antiga para a mais nova.

## Aportes e resgates

- Ao agir sobre um `Aporte sugerido` ou `Resgate necessário`, o aplicativo procura um lançamento real de `Aporte` ou `Resgate`, na categoria `Investimento`, dentro do mesmo ciclo.
- Sem movimento real no ciclo, a ação materializa uma nova linha aberta. Com movimento real, a ação passa a ser `Consolidar` e faz `UPDATE` nessa linha: valores do mesmo sentido somam e valores opostos se abatem. Se houver inversão de sinal, o nome passa a refletir o movimento que restou.
- Se o abatimento zerar o valor, a linha existente é mantida com valor zero; a ação não exclui lançamentos automaticamente.

## Migrations

- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- `migrations/01-nao-volatil-lancamentos.sql` e `migrations/02-volatil-lancamentos.sql` permanecem somente como histórico das alterações já aplicadas.
- `migrations/03-remover-fatura-isabella-periodos.sql` registra a remoção de `periodos.fecha_isa` e `periodos.venc_isa`. Ela é idempotente porque essas colunas podem já ter sido removidas diretamente no banco.
- `migrations/04-remover-volatil-lancamentos.sql` remove definitivamente `lancamentos.volatil`. O aplicativo não exibe, filtra, grava nem atualiza essa flag.
- `migrations/05-faturas-db-first.sql` registra o modelo anterior de `faturas`; as migrations 10 e 11 o substituem por `lancamentos.fatura_venc`, sem tabela de faturas. Nenhum valor de fatura é calculado ou armazenado no banco.
- `migrations/06-exigir-fatura-no-credito.sql` registra a validação que mantém crédito e débito coerentes com a fatura escolhida.

## Testes

- A estrutura em arquivos clássicos carrega `js/app-state.js`, `js/shared.js`, `js/supabase-api.js`, `js/finance.js`, `js/data-ui.js`, `js/tables.js`, `js/cycle-views.js`, `js/interactions.js`, `js/charts.js`, `js/form.js` e `js/bootstrap.js` nessa ordem. Estado/configuração, utilitários, Supabase, cálculos financeiros, carregamento, tabelas, visões, comandos, gráficos, formulário e inicialização ficam em módulos próprios. A separação é coberta por `node --test tests/estrutura-modulos.test.js`.
- O preenchimento sugerido das faturas em vendas simuladas é coberto por `node --test tests/faturas-simulacao.test.js`.
- A consolidação de aporte/resgate no mesmo ciclo é coberta por `node --test tests/materializacao-ajuste.test.js`.
- A meta de reserva emergência, calculada para os nove ciclos seguintes com valores previstos e estimados, é coberta por `node --test tests/meta-reserva-emergencia.test.js`.
- O cadastro e a alternância imediata da classificação Reserva emergência são cobertos por `node --test tests/reserva-emergencia-interacao.test.js`.
- O deslocamento visual de uma competência na tabela Crédito é coberto por `node --test tests/layout-creditos.test.js`.

## Reserva emergência

- `lancamentos.reserva_emergencia` é a classificação existente no banco. A migration `migrations/12-renomear-essencial-para-reserva-emergencia.sql` renomeia a coluna e preserva seus valores.
- O formulário mostra a caixa **Reserva emergência** desmarcada por padrão e novos lançamentos são salvos como `false` até ela ser marcada.
- Nas tabelas, o badge Reserva emergência é clicável para alternar a classificação de todos os lançamentos reais com o mesmo `nome` exato, em qualquer ciclo; a alteração é salva imediatamente. Em simulações, apenas as linhas simuladas com esse mesmo nome mudam em memória.
- O botão **Reserva emergência**, ao lado de **Gráfico**, mostra uma pizza de progresso. A meta soma os gastos negativos marcados como reserva emergência nos nove ciclos a partir do selecionado, respeitando os filtros ativos e excluindo transferências de pagamento/antecipação de fatura. Para cada nome, o valor cadastrado em um ciclo substitui o anterior; se não houver ocorrência cadastrada naquele ciclo, mantém-se o último valor conhecido como estimativa. O modal informa quantos ciclos contêm estimativas.
- O valor guardado da pizza usa `guardadoAte(ciclo)`, a mesma base exibida no título Débito; por isso ele soma tudo que já foi guardado até aquele ciclo.
