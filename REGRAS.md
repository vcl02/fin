# Regras dos lançamentos

## Faturas

- A fonte de verdade das faturas passa a ser `public.faturas`: `referencia` (primeiro dia do mês, apenas identificação), `vencimento` e `pago`.
- Todo lançamento novo com `cred = true` deverá receber `fatura_id` escolhido manualmente. O total da fatura nunca é gravado: é a soma dos `lancamentos.valor` ligados a ela.
- O banco protege essa distinção: crédito sem `fatura_id` e débito com `fatura_id` são inválidos.
- `periodos` não é lida pela aplicação. Ela permanece temporariamente apenas como histórico para auditoria da migração dos créditos e poderá ser removida depois da conferência.
- Cada lançamento `Faturamento PJ` abre um ciclo de débito. O ciclo vai dessa data até o dia anterior ao próximo `Faturamento PJ`; uma fatura entra no ciclo que contém seu `vencimento`.

- Existe um único cartão detalhado. Todo lançamento com `cred = true` usa `periodos.fecha` e `periodos.venc` para definir a fatura; `isa` não seleciona outro calendário de cartão.
- A fatura da Isabella é um lançamento real comum: `cred = false`, `isa = true`, valor negativo e `pago` indicando Aberto/Pago. Pode começar com um valor máximo estimado e receber `UPDATE` no mesmo lançamento quando o total fechar.
- A fatura da Isabella não é criada como linha sintética, não é calculada pela soma de compras e não participa da alocação de antecipações do cartão detalhado.
- `periodos` não possui mais `fecha_isa` nem `venc_isa`. O campo `isa` continua identificando lançamentos da Isabella para filtros e para a visão restrita.
- Antecipações de fatura abatem somente a única fatura detalhada, da mais antiga para a mais nova.

## Migrations

- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- `migrations/01-nao-volatil-lancamentos.sql` e `migrations/02-volatil-lancamentos.sql` permanecem somente como histórico das alterações já aplicadas.
- `migrations/03-remover-fatura-isabella-periodos.sql` registra a remoção de `periodos.fecha_isa` e `periodos.venc_isa`. Ela é idempotente porque essas colunas podem já ter sido removidas diretamente no banco.
- `migrations/04-remover-volatil-lancamentos.sql` remove definitivamente `lancamentos.volatil`. O aplicativo não exibe, filtra, grava nem atualiza essa flag.
- `migrations/05-faturas-db-first.sql` registra `faturas`, a chave `lancamentos.fatura_id` e a política RLS de somente leitura para a aplicação. Nenhum valor de fatura é calculado ou armazenado no banco.
- `migrations/06-exigir-fatura-no-credito.sql` registra a validação que mantém crédito e débito coerentes com a fatura escolhida.
