# Guia do Fin Hub

## Fronteira desta fundação

- Este Hub está em transição; a aplicação estática da raiz permanece em produção e é a fonte de verdade do Fin.
- Não conecte este código a Supabase, PostgreSQL de produção ou GitHub Pages sem decisão explícita do mantenedor.
- Não execute `DbMigrator`, `dotnet ef database update` ou qualquer alteração remota sem confirmação explícita nesta conversa.

## Arquitetura alvo

- `.NET 10` e ABP formam um monólito modular: regras no `Domain`, casos de uso no `Application`, contratos em `Application.Contracts`, persistência no `EntityFrameworkCore` e borda HTTP no `HttpApi`/`HttpApi.Host`.
- Angular consome apenas contratos HTTP tipados; nunca acessa banco ou Supabase diretamente.
- Toda regra financeira migrada deve manter sua especificação em `docs/REGRAS.md`, ganhar teste determinístico e chegar ao Hub por um contrato pequeno.

## Estado atual

- A rota `/fin` existe apenas como marcador visual. Não há leitura, escrita ou migration de dados financeiros.
