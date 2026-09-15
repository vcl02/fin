# Regras dos lançamentos

## Não Volátil

- `lancamentos.nao_volatil` é uma flag booleana manual. `false` é o padrão para registros existentes e novos; só uma escolha explícita marca `true`.
- A flag não muda valor, categoria, frequência, datas, pagamento, saldo nem cálculos financeiros. O filtro “Não Volátil” apenas recorta os lançamentos exibidos nas visões.
- Ciclo e Backlog mostram a flag por lançamento. Comparar mostra a flag no detalhamento de cada célula. Em telas pequenas, ela aparece junto ao nome.
- A flag pode ser alternada nas linhas reais por `id` via `PATCH`. Se o banco rejeitar a atualização, a tela volta ao valor anterior. Linhas simuladas são alteradas somente em memória.
- Cada parcela criada recebe o valor escolhido no cadastro. Duplicar herda a flag do lançamento de origem, que pode ser alterada antes de salvar.
- Linhas sintéticas não têm flag nem podem ser atualizadas. Ao materializar Aporte/Resgate, o novo lançamento real começa com `nao_volatil = false`.

## Migrations

- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- Execute apenas `migrations/01-nao-volatil-lancamentos.sql` para adicionar a coluna. A aplicação precisa da coluna antes de salvar novos lançamentos.
- Depois de executar `01`, confira cadastro, duplicação e alternância da flag na interface autenticada.
