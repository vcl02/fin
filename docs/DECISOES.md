# Decisões de arquitetura

## HTML estático único

O projeto permanece em um único `index.html` porque é publicado como site estático. Fragmentos HTML exigiriam build ou carregamento assíncrono e aumentariam a chance de scripts acessarem elementos antes de existirem.

## JavaScript clássico modular

Os arquivos em `js/` são scripts clássicos carregados em ordem explícita. Isso mantém a aplicação simples para editar, depurar no navegador e hospedar sem bundler. A ordem é um contrato testado.

## Estilo sem formatter pesado

O projeto usa `.editorconfig` e checagem nativa de tabs, espaços finais e newline final. ESLint e Prettier ficam fora por enquanto: em scripts clássicos globais eles exigiriam configuração extra e causariam um reformat amplo sem melhorar diretamente as regras financeiras.

## Linguagem visual

O tema é sempre escuro, mas em cinza grafite legível, sem uma tela predominantemente preta. Ações compactas usam ícones com `title` e rótulo acessível; textos permanecem curtos e só aparecem quando esclarecem uma decisão. Formulários recebem somente campos necessários. Não existe modo especial por e-mail ou titular: `Isabella` é uma categoria comum. No mobile, `modoSimples` não exibe o bloco Crédito; as tabelas permitem somente seleção para somar valores e não oferecem edição, duplicação, exclusão nem atualização.

## Cadastro com layout fixo

Exceção pontual, sem mudar a direção minimalista: no cadastro, trocar Crédito ou Frequência desativa campos em vez de escondê-los. Vezes fica desativado mostrando a contagem da série, Fatura vira "—" no Débito e as faturas das parcelas 2..N ficam num modal aberto pelo "+N". Esconder e reaparecer campos movia Dividir, Fatura e Salvar a cada toque, o que pesava mais que um campo desativado à vista. Em Editar, Vezes e Dividir continuam escondidos: o modo é fixo durante toda a edição, então não há salto. Os demais formulários seguem a regra geral de mostrar só o necessário.

## Fatura e Crédito

Há dois cartões detalhados: Nubank (vence dia 12, todo o histórico) e Mercado Pago (vence dia 13). A fatura é derivada de `fin.fatura`; o título e os cálculos usam o ciclo correto, enquanto a tabela Crédito é uma prévia visual do ciclo seguinte, única para os dois cartões. Regra provisória: o cartão sai do dia do vencimento da fatura (`cartaoDaFatura`), sem coluna nova nem migration — escolha do mantenedor pela simplicidade, já que os dois vencimentos são dias diferentes. Nome e categoria continuam sem identificar cartão.

O limite contratado (Aprovado) de cada cartão e quanto do guardado vira garantia do Nubank são definidos por ciclo, na linha do ciclo na tabela `fin_ciclo`, herdando do ciclo anterior até outro definir outro — no banco, e não no navegador, para valerem igual em qualquer aparelho. O limite livre de cada cartão considera somente as próprias compras confirmadas (`pago = true`) e desconta as antecipações alocadas às faturas do próprio cartão. Só o Nubank acrescenta garantia: a parte escolhida do guardado positivo dos aportes/resgates reais até o ciclo (todo ele, sem escolha), nunca acima do guardado; o Mercado Pago não tem garantia. A garantia não obedece ao filtro Pago ou a outros filtros visuais e não inclui `Aporte sugerido`, pois apenas dinheiro aplicado na Nubank pode ampliar o limite. O mesmo título mostra o total utilizável (limite contratado mais garantia), para a soma não ficar implícita. Isso separa projeção de compra real e evita que antecipação libere mais do que a fatura paga.

A regra pelo dia do vencimento deixa de valer se os dois cartões passarem a vencer no mesmo dia ou se entrar um terceiro cartão. Nesse caso, a evolução é uma mudança de modelo deliberada: migration nova para uma identidade explícita de cartão em crédito e antecipação, mantendo os cálculos por cartão que já existem.

## Reserva de emergência

A meta usa nove ciclos futuros e somente despesas da categoria `Reserva`. Para cada nome, um valor cadastrado no ciclo substitui a estimativa anterior; sem ocorrência, o último valor conhecido é projetado. Isso acomoda aumentos graduais, como Evolução Obra.

## Dados e banco

Supabase é a fonte de dados. O frontend não executa migrations nem cria dados fictícios para testar. Migrations históricas são preservadas, e mudanças de esquema exigem uma nova migration numerada. Consultas de leitura, inclusive `SELECT` e inspeção de schema, podem apoiar diagnóstico; qualquer ação remota que altere estado exige confirmação explícita prévia do mantenedor, mesmo se o MCP expuser a ferramenta.

## Documentação de produto

As regras financeiras vivem em `docs/REGRAS.md`, junto das decisões e do checklist de publicação. O `AGENTS.md` na raiz continua curto e operacional, para orientar manutenção e automação.

## Hub abandonado

A fundação paralela `hub/Vcl.FinHub` (.NET, ABP, Angular, PostgreSQL local) foi encerrada e removida do repositório. A aplicação estática e `docs/REGRAS.md` continuam sendo a única fonte de verdade; não há plano ativo de migração para outro produto.
