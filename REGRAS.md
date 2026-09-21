# Regras dos lançamentos

## Faturas

- As faturas existentes são derivadas das datas `fatura_venc` já usadas nos lançamentos; a aplicação não usa uma tabela `faturas`.
- Todo lançamento novo com `cred = true` deverá receber `fatura_venc` escolhido manualmente. O total da fatura nunca é gravado: é a soma dos `lancamentos.valor` ligados a ela.
- Ao simular uma venda no crédito, cada prestação mostra como sugestão a fatura disponível mais próxima da data daquela prestação (ou a última conhecida se a data a ultrapassar). A sugestão não é regra: cada seletor continua editável e deve ser conferido antes de simular.
- `periodos` não é lida pela aplicação. Ela permanece temporariamente apenas como histórico para auditoria da migração dos créditos e poderá ser removida depois da conferência.
- Cada lançamento `Faturamento PJ` abre um ciclo de débito. O ciclo vai dessa data até o dia anterior ao próximo `Faturamento PJ`; uma fatura entra no ciclo que contém seu `vencimento`.

- Existe um único cartão detalhado. Todo lançamento com `cred = true` aponta para `fatura_venc`; `isa` não seleciona outro calendário de cartão.
- A fatura da Isabella é um lançamento real comum: `cred = false`, `isa = true`, valor negativo e `pago` indicando Aberto/Pago. Pode começar com um valor máximo estimado e receber `UPDATE` no mesmo lançamento quando o total fechar.
- A fatura da Isabella não é criada como linha sintética, não é calculada pela soma de compras e não participa da alocação de antecipações do cartão detalhado.
- O campo `isa` continua identificando lançamentos da Isabella para filtros e para a visão restrita.
- Antecipações de fatura abatem somente a única fatura detalhada, da mais antiga para a mais nova.

## Migrations

- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- `migrations/01-nao-volatil-lancamentos.sql` e `migrations/02-volatil-lancamentos.sql` permanecem somente como histórico das alterações já aplicadas.
- `migrations/03-remover-fatura-isabella-periodos.sql` registra a remoção de `periodos.fecha_isa` e `periodos.venc_isa`. Ela é idempotente porque essas colunas podem já ter sido removidas diretamente no banco.
- `migrations/04-remover-volatil-lancamentos.sql` remove definitivamente `lancamentos.volatil`. O aplicativo não exibe, filtra, grava nem atualiza essa flag.
- `migrations/05-faturas-db-first.sql` registra o modelo anterior de `faturas`; as migrations 10 e 11 o substituem por `lancamentos.fatura_venc`, sem tabela de faturas. Nenhum valor de fatura é calculado ou armazenado no banco.
- `migrations/06-exigir-fatura-no-credito.sql` registra a validação que mantém crédito e débito coerentes com a fatura escolhida.

## Testes

- O preenchimento sugerido das faturas em vendas simuladas é coberto por `node --test tests/faturas-simulacao.test.js`.
