# Regras dos lançamentos

## Volátil

- `lancamentos.volatil` é uma flag booleana manual. `true` é o padrão para registros existentes e novos; desmarcar a flag indica que o lançamento não é volátil.
- A flag não muda valor, categoria, frequência, datas, pagamento, saldo nem cálculos financeiros. O filtro “Volátil” apenas recorta os lançamentos exibidos nas visões.
- Ciclo e Backlog mostram a flag por lançamento. Comparar mostra a flag no detalhamento de cada célula. Em telas pequenas, ela aparece junto ao nome.
- A flag pode ser alternada nas linhas reais por `id` via `PATCH`. Se o banco rejeitar a atualização, a tela volta ao valor anterior. Linhas simuladas são alteradas somente em memória.
- Cada parcela criada recebe o valor escolhido no cadastro. Duplicar herda a flag do lançamento de origem, que pode ser alterada antes de salvar.
- Linhas sintéticas não têm flag nem podem ser atualizadas. Ao materializar Aporte/Resgate, o novo lançamento real começa com `volatil = true`.

## Migrations

- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- `migrations/01-nao-volatil-lancamentos.sql` já foi aplicada e permanece como histórico.
- Execute `migrations/02-volatil-lancamentos.sql` para renomear a coluna e inverter os valores existentes: `nao_volatil = false` passa a `volatil = true` e vice-versa.
- Depois de executar `02`, confira cadastro, duplicação e alternância da flag na interface autenticada.
