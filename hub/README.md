# Fundação do Fin Hub

Esta pasta é uma fundação paralela para o futuro Hub pessoal. Ela **não substitui** a aplicação estática da raiz neste momento.

## Escopo do passo 1

- Backend em .NET 10 LTS com ABP e PostgreSQL como provedor de dados futuro.
- Frontend Angular 21.2, a versão compatível com o ABP 10.6.1 usado na fundação, com uma única rota inicial: `/fin`.
- Camadas separadas pelo template ABP: `Domain.Shared`, `Domain`, `Application.Contracts`, `Application`, `EntityFrameworkCore`, `HttpApi` e `HttpApi.Host`.
- O módulo Fin está deliberadamente vazio. A rota informa que os dados continuam no legado.

## Limites deliberados

- Não há conexão com Supabase, importação de dados, migration executada, credencial real nem integração com GitHub Pages.
- As connection strings presentes nos `appsettings.json` são exemplos locais do template. Não as troque por credenciais de produção nem rode o `DbMigrator` sem uma decisão de migração e confirmação explícita.
- Não copie regras financeiras para cá. Até a primeira migração de caso de uso, `docs/REGRAS.md` e a aplicação estática continuam sendo a única fonte de verdade.
- Os testes iniciais estão no backend .NET. O template trouxe `vitest` e `jsdom` sem testes de interface, e eles foram retirados desta fundação para não forçar uma árvore npm incompatível; testes Angular entram junto da primeira tela com comportamento real.

## Visualização local nesta fase

Para ver a rota vazia `/fin`, execute somente o Angular em `Vcl.FinHub/angular` com `npm start` e abra `http://localhost:4200/fin`.

Não execute o `HttpApi.Host` por enquanto: o template ABP tenta inicializar seus módulos padrão em PostgreSQL local e, como não existe banco de desenvolvimento configurado nesta fase, ele registra erros de conexão em `localhost:5432`. Isso não acessa o Supabase nem cria migrations; o host entra quando definirmos a base de desenvolvimento do Hub.

## Próximo passo proposto

Definir um primeiro recorte pequeno do Fin (por exemplo, somente leitura de ciclos), seu contrato tipado e uma base de desenvolvimento separada antes de conectar qualquer banco.
