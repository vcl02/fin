# Decisões de arquitetura

## HTML estático único

O projeto permanece em um único `index.html` porque é publicado como site estático. Fragmentos HTML exigiriam build ou carregamento assíncrono e aumentariam a chance de scripts acessarem elementos antes de existirem.

## JavaScript clássico modular

Os arquivos em `js/` são scripts clássicos carregados em ordem explícita. Isso mantém a aplicação simples para editar, depurar no navegador e hospedar sem bundler. A ordem é um contrato testado.

## Estilo sem formatter pesado

O projeto usa `.editorconfig` e checagem nativa de tabs, espaços finais e newline final. ESLint e Prettier ficam fora por enquanto: em scripts clássicos globais eles exigiriam configuração extra e causariam um reformat amplo sem melhorar diretamente as regras financeiras.

## Linguagem visual

O tema é sempre escuro, mas em cinza grafite legível, sem uma tela predominantemente preta. Ações compactas usam ícones com `title` e rótulo acessível; textos permanecem curtos e só aparecem quando esclarecem uma decisão. Formulários recebem somente campos necessários. Não existe modo especial por e-mail ou titular: `Isabella` é uma categoria comum. No mobile, `modoSimples` não exibe o bloco Crédito; as tabelas permitem somente seleção para somar valores e não oferecem edição, duplicação, exclusão nem atualização.

## Fatura e Crédito

Hoje há um único cartão detalhado: Nubank. A fatura é derivada de `fin.fatura`; o título e os cálculos usam o ciclo correto, enquanto a tabela Crédito é uma prévia visual do ciclo seguinte. `cred = true` pertence a esse cartão por definição temporária, não por nome ou categoria.

O limite contratado Nubank é uma preferência local editável no título, persistida no navegador e nunca no Supabase. O limite livre considera somente compras confirmadas (`pago = true`), desconta antecipações alocadas à respectiva fatura e acrescenta a garantia positiva dos aportes/resgates reais até o ciclo. A garantia não obedece ao filtro Pago ou a outros filtros visuais e não inclui `Aporte sugerido`, pois apenas dinheiro aplicado na Nubank pode ampliar o limite. O mesmo título mostra o total utilizável (limite contratado mais garantia), para a soma não ficar implícita. Isso separa projeção de compra real e evita que antecipação libere mais do que a fatura paga.

Não há abstração de múltiplos cartões antes de ser necessária. Quando existir outro cartão, a evolução será uma mudança de modelo deliberada: migration nova para uma identidade explícita de cartão em crédito e antecipação, dados próprios por cartão para limite, garantia e faturas, seleção no cadastro e cálculo/renderização segmentados. Não se deve usar marca, categoria, nome do lançamento ou vencimento como atalho para identificar o cartão.

## Reserva de emergência

A meta usa nove ciclos futuros e somente despesas da categoria `Reserva`. Para cada nome, um valor cadastrado no ciclo substitui a estimativa anterior; sem ocorrência, o último valor conhecido é projetado. Isso acomoda aumentos graduais, como Evolução Obra.

## Dados e banco

Supabase é a fonte de dados. O frontend não executa migrations nem cria dados fictícios para testar. Migrations históricas são preservadas, e mudanças de esquema exigem uma nova migration numerada. Consultas de leitura, inclusive `SELECT` e inspeção de schema, podem apoiar diagnóstico; qualquer ação remota que altere estado exige confirmação explícita prévia do mantenedor, mesmo se o MCP expuser a ferramenta.

## Documentação de produto

As regras financeiras vivem em `docs/REGRAS.md`, junto das decisões e do checklist de publicação. O `AGENTS.md` na raiz continua curto e operacional, para orientar manutenção e automação.

## Fundação paralela do Hub

Enquanto o Fin estático continuar publicado, `hub/Vcl.FinHub` é uma fundação isolada em .NET 10, ABP, Angular 22 e PostgreSQL futuro. Ela existe para validar as camadas e contratos do próximo produto sem arriscar os cálculos, os dados ou o deploy atual. A rota `/fin` é somente um marcador de transição; a aplicação estática e `docs/REGRAS.md` seguem como fonte de verdade até cada caso de uso ser migrado deliberadamente.

O backend adota ABP desde a fundação. A primeira tela Angular consome somente um contrato HTTP tipado de consulta do snapshot local, por isso registra apenas `HttpClient`, sem tema, menu ou providers Angular do ABP. A versão publicada do tema transitivamente mistura majors do Angular antes de qualquer uso real; incluí-lo agora cria falha de inicialização e acoplamento sem benefício. Ao migrar o primeiro caso de uso autenticado, as dependências Angular do ABP entram como um conjunto oficialmente compatível e junto de seus testes.

## Banco local do Hub

Como não há um ambiente Supabase de desenvolvimento separado, o Hub usa PostgreSQL 16 em Docker apenas na máquina de desenvolvimento, publicado exclusivamente em `127.0.0.1:54329`. O container não é destino de publicação nem conexão de produção. Inicialmente contém apenas infraestrutura técnica; depois de uma decisão explícita, pode guardar o snapshot local somente leitura descrito abaixo. `DbMigrator` pode criar a infraestrutura técnica do ABP nesse banco local; toda migration de domínio e qualquer cópia seletiva da produção continuam decisões explícitas, revisadas e testadas antes de serem executadas.

A migration `Initial` do Hub existe somente para materializar os módulos técnicos selecionados pelo template ABP (identidade, permissões, configurações e auditoria) no ambiente local. Ela não introduz tabela financeira nem replica o schema ou dados do Supabase; o primeiro agregado financeiro será uma migration posterior, acompanhada do contrato e da regra migrada.

## Snapshot local do legado

O Hub possui um adaptador manual chamado `Vcl.FinHub.LegacyImport`. Ele lê `public.fin` por REST do Supabase e grava apenas no PostgreSQL Docker local, nas tabelas de staging `LegacyFinSnapshots` e `LegacyFinSnapshotRuns`. A direção é sempre produção para local: não há operação remota de escrita, endpoint HTTP, job, seed, chave de serviço ou credencial versionada. A leitura termina e é validada antes da transação local que troca o snapshot; uma falha preserva o snapshot anterior. Os campos necessários para conferência são tipados e `RegistroOriginal` mantém o JSON de cada linha para futuras colunas do legado não se perderem.

Esse staging não é ainda um agregado financeiro nem autoriza o Hub a mudar as regras ou a fonte de verdade. A migration `AddLegacyFinSnapshot` fica versionada para o mantenedor aplicar localmente quando quiser. A policy atual de leitura de `public.fin` libera apenas o papel `authenticated`; por isso o importador exige JWT de sessão desse papel e nunca confunde a chave publicável `anon` com autorização de dados. O primeiro endpoint do Hub é excepcionalmente uma consulta local anônima, limitada a esse snapshot de desenvolvimento: recebe um mês, separa Débito por `data` e Crédito por `fatura`, e devolve totais brutos e linhas sem saldo, antecipação, limite ou escrita. Uma sincronização diária exigirá depois um desenho explícito de identidade somente leitura e expiração/rotação de credencial; token de sessão de navegador não será automatizado.
