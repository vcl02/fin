# Regras dos lançamentos

## Fechamento do cartão

- A visualização usa a data original da compra, sem deslocamento por captura D+0 ou D+1.
- Compra anterior ao fechamento entra na fatura que fecha naquela data. Compra no próprio dia do fechamento, ou depois dele, entra na fatura seguinte.
- O cartão principal usa `periodos.fecha`; o cartão da Isabella usa `periodos.fecha_isa`.

## Volátil

- `lancamentos.volatil` é uma flag booleana manual. `true` é o padrão para registros existentes e novos; desmarcar a flag indica que o lançamento não é volátil.
- A flag não muda valor, categoria, frequência, datas, pagamento, saldo nem cálculos financeiros. O filtro “Volátil” apenas recorta os lançamentos exibidos nas visões.
- Ciclo e Backlog mostram a flag por lançamento na visão completa. Comparar mostra a flag no detalhamento de cada célula. No modo simples, a tag não aparece junto ao nome.
- Ao marcar ou desmarcar Volátil em uma linha real, o `PATCH` atualiza todos os lançamentos cujo `nome` é exatamente igual, em qualquer ciclo, categoria ou situação. O retorno da API é conferido pelos IDs carregados antes de refletir a mudança na tela.
- O filtro `nome=eq.` envia o nome sem aspas adicionais, com codificação de URL. Assim, nomes com espaços, acentos e pontuação continuam sendo comparados exatamente; aspas extras buscariam outro nome e deixariam o grupo sem atualização.
- Se o banco rejeitar a atualização ou alterar só parte do grupo, os dados são recarregados e o erro é mostrado. Linhas simuladas com o mesmo nome são alteradas juntas apenas em memória; clicar nelas não grava mudanças nos lançamentos reais.
- Cada parcela criada recebe o valor escolhido no cadastro. Duplicar herda a flag do lançamento de origem, que pode ser alterada antes de salvar.
- Linhas sintéticas não têm flag nem podem ser atualizadas. Ao materializar Aporte/Resgate, o novo lançamento real começa com `volatil = true`.

## Migrations

- `migrations/00-esquema-existente.sql` registra o esquema anterior e não deve ser executado no projeto `fin` existente.
- `migrations/01-nao-volatil-lancamentos.sql` já foi aplicada e permanece como histórico.
- Execute `migrations/02-volatil-lancamentos.sql` para renomear a coluna e inverter os valores existentes: `nao_volatil = false` passa a `volatil = true` e vice-versa.
- Depois de executar `02`, confira cadastro, duplicação e alternância da flag na interface autenticada.
