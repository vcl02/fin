# Fundação do Fin Hub

Esta pasta é uma fundação paralela para o futuro Hub pessoal. Ela **não substitui** a aplicação estática da raiz neste momento.

## Escopo do passo 1

- Backend em .NET 10 LTS com ABP e PostgreSQL como provedor de dados futuro.
- Frontend Angular 22, com a home `/` e o módulo `/fin`. A home lista somente opções existentes; `fin` consulta por HTTP o snapshot local e oferece uma visão de Débito e Crédito pelos ciclos ancorados em `Faturamento PJ`. O backend segue ABP; a casca não carrega o tema Angular do ABP antes de existir autenticação real para ele consumir.
- Camadas separadas pelo template ABP: `Domain.Shared`, `Domain`, `Application.Contracts`, `Application`, `EntityFrameworkCore`, `HttpApi` e `HttpApi.Host`.
- O módulo Fin possui somente um contrato de consulta local. Ele não grava, não acessa Supabase pelo Angular e, além dos totais brutos, migra os retratos Hoje e Futuro de Saldo/Guardado do Débito. Futuro incorpora a fatura líquida de antecipações e ajustes sintéticos somente em memória. A prévia de Crédito mostra o ciclo seguinte: Hoje usa somente compras e antecipações já pagas até a data local, e Futuro mostra a fatura completa líquida de antecipações. Limite continua exclusivamente no Fin estático.

## Limites deliberados

- Não há contrato financeiro de produção, credencial real versionada nem integração com GitHub Pages. A única ponte disponível é o importador manual e unidirecional explicado abaixo; ele ainda não é agendado nem foi configurado com produção.
- As connection strings presentes nos `appsettings.json` são exemplos locais do template. Não as troque por credenciais de produção nem rode o `DbMigrator` sem uma decisão de migração e confirmação explícita.
- Não copie regras financeiras para cá. Até a primeira migração de caso de uso, `docs/REGRAS.md` e a aplicação estática continuam sendo a única fonte de verdade.
- Os testes iniciais estão no backend .NET. O template trouxe `vitest` e `jsdom` sem testes de interface, e eles foram retirados desta fundação para não forçar uma árvore npm incompatível; testes Angular entram junto da primeira tela com comportamento real.

## Ambiente local isolado

O Hub usa um PostgreSQL local em Docker. Ele é exclusivamente de desenvolvimento: não aponta para Supabase, não recebe dados de produção e não publica nada. A senha presente no `docker-compose.yml` é propositalmente pública e limitada ao container na máquina local; ela não é uma credencial reutilizável.

Instale o **Docker Desktop** com backend **WSL 2**. Depois, em `hub/Vcl.FinHub`, execute uma vez:

```powershell
docker compose up -d
docker compose ps
cd aspnet-core/src/Vcl.FinHub.DbMigrator
dotnet run --no-restore
```

O último comando aplica a migration inicial versionada em `EntityFrameworkCore/Migrations/`. Ela cria somente as tabelas técnicas do ABP neste PostgreSQL local. Não cria lançamentos financeiros, não contata o Supabase e pode ser repetida quando houver uma migration do Hub aprovada.

Para executar a API, em outro terminal:

```powershell
cd aspnet-core/src/Vcl.FinHub.HttpApi.Host
dotnet run --no-restore
```

E, para o Angular, em um terceiro terminal:

```powershell
cd angular
npm start
```

Abra `http://localhost:4200/fin`. Para parar só o banco, use `docker compose stop`. Não use `docker compose down -v` sem intenção de apagar todo o banco local.

## Snapshot local opcional do Fin legado

`Vcl.FinHub.LegacyImport` é um executável de infraestrutura, separado da API e do Angular. Ele faz somente isto: lê todas as páginas de `public.fin` por `GET` no Supabase, valida IDs e substitui **atomicamente** as tabelas locais `LegacyFinSnapshots` e `LegacyFinSnapshotRuns`. Os campos conhecidos são tipados e anuláveis, pois o legado contém lançamentos históricos incompletos; o JSON original é preservado e a cópia não vira, por acidente, o modelo financeiro definitivo do Hub.

Ele nunca chama `INSERT`, `UPDATE`, `DELETE`, migration ou RPC no Supabase. Se a leitura falhar, o snapshot local anterior é mantido. Não há job diário nem token salvo no repositório. A API local expõe apenas a leitura mensal já importada, em `GET /api/app/legacy-fin-snapshot/cycle`.

Quando você decidir executar a primeira cópia, depois de aplicar localmente a migration `AddLegacyFinSnapshot`, faça em um terminal na pasta abaixo:

```powershell
cd hub/Vcl.FinHub/aspnet-core/src/Vcl.FinHub.LegacyImport
Copy-Item appsettings.local.example.json appsettings.local.json
```

Preencha o arquivo novo com a URL do projeto, a chave publicável e um JWT de sessão com papel `authenticated`, coberto pela policy de leitura já existente em `public.fin`. A chave publicável tem papel `anon`: ela serve no cabeçalho `apikey`, mas não é o token de leitura e o importador a rejeita nesse campo. O arquivo é ignorado pelo Git. Não use nem crie uma `service_role` para isso. Então rode:

```powershell
dotnet run --no-restore
```

O comando mostra quantidade, total assinado e maior `id` importados. Para uma sincronização diária confiável no futuro, será preciso decidir uma credencial dedicada de leitura ou uma borda autenticada; um token de sessão comum expira e não deve ser automatizado agora.

## Próximo passo proposto

A próxima decisão é escolher a primeira regra financeira a migrar de verdade. A tela atual é somente conferência do snapshot e não substitui o Fin estático.
