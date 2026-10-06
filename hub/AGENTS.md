# Guia do Fin Hub

## Fronteira desta fundação

- Este Hub está em transição; a aplicação estática da raiz permanece em produção e é a fonte de verdade do Fin.
- A única exceção de integração é `Vcl.FinHub.LegacyImport`: um comando manual e unidirecional que pode ler `public.fin` do Supabase e gravar somente no PostgreSQL local do Hub. O Hub expõe apenas a consulta HTTP local e anônima desse snapshot; ela não agenda execução, não escreve no Supabase e não é uma API de produção.
- Credenciais da leitura ficam exclusivamente em `src/Vcl.FinHub.LegacyImport/appsettings.local.json`, ignorado pelo Git. O token de acesso deve ser uma sessão `authenticated` autorizada pela policy `SELECT` de `public.fin`; a chave publicável `anon` não substitui esse token. Nunca reutilize chave de serviço, inclua segredo em código ou execute o comando sem uma confirmação explícita nesta conversa.
- Não conecte este código a PostgreSQL de produção ou GitHub Pages sem decisão explícita do mantenedor. Não execute `DbMigrator`, `dotnet ef database update` ou qualquer alteração remota sem confirmação explícita nesta conversa.

## Arquitetura alvo

- `.NET 10` e ABP formam um monólito modular: regras no `Domain`, casos de uso no `Application`, contratos em `Application.Contracts`, persistência no `EntityFrameworkCore` e borda HTTP no `HttpApi`/`HttpApi.Host`.
- Angular consome apenas contratos HTTP tipados; nunca acessa banco ou Supabase diretamente. Antes do primeiro contrato, a rota é Angular puro: não antecipe o tema ou providers Angular do ABP só para uma tela vazia.
- Toda regra financeira migrada deve manter sua especificação em `docs/REGRAS.md`, ganhar teste determinístico e chegar ao Hub por um contrato pequeno.

## Estado atual

- A rota `/` é a home mínima do Hub e lista apenas módulos existentes. A rota `/fin` consulta somente leitura do snapshot local por um contrato HTTP tipado. Ela usa a fronteira de ciclos ancorada em `Faturamento PJ`, separa Débito por `data` e Crédito por `fatura`, mostra totais brutos e não reproduz saldo, limite, antecipações, gráficos ou qualquer outra regra financeira do Fin estático.
- O PostgreSQL de desenvolvimento é o container local `finhub-postgres-local`, na porta `54329`. A migration `AddLegacyFinSnapshot` cria somente um staging local do legado e sua auditoria; ela não transforma essas linhas no modelo financeiro do Hub.
- A primeira tabela de domínio financeiro deve surgir em uma migration posterior, revisada junto de seu contrato e regra em `docs/REGRAS.md`.
