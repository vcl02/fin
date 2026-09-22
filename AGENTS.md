# Guia de manutenção do `fin`

## Propósito e fontes de verdade

- Esta é uma aplicação estática, em HTML/CSS/JavaScript clássico, para acompanhamento financeiro pessoal. Ela usa o Supabase somente pelo cliente do navegador.
- `docs/REGRAS.md` é a fonte de verdade das regras financeiras e de comportamento visível. Não duplique regras de negócio aqui: atualize aquele arquivo quando uma regra mudar.
- Este arquivo define como trabalhar no repositório. Em caso de conflito, uma solicitação explícita do usuário vence este guia.

## Arquitetura

- `index.html` é o único documento da aplicação. Mantenha-o assim enquanto o deploy for estático no GitHub Pages; não introduza fragmentos HTML ou um framework sem uma decisão explícita.
- Os estilos são carregados nesta ordem: `css/base.css`, `css/dashboard.css`, `css/forms.css`, `css/charts.css`, `css/utilities.css`, `css/mobile.css`. `mobile.css` precisa ser o último, pois contém os overrides responsivos.
- Os scripts clássicos são carregados nesta ordem: `app-state`, `domain`, `shared`, `supabase-api`, `finance`, `data-ui`, `tables`, `cycle-views`, `interactions`, `charts`, `form`, `bootstrap`. Respeite as dependências globais entre eles.
- Preserve a responsabilidade de cada módulo: estado/configuração, utilitários, API, cálculos, carga, tabelas, visões, interações, gráficos, formulário e inicialização.
- Todo arquivo `.js`, `.css`, `.sql` e `.test.js` deve começar com um cabeçalho curto de responsabilidade; no HTML, comente as regiões que são preenchidas ou controladas pelo JavaScript. O teste `documentacao-estrutura.test.js` protege esse padrão.

## Regras de dados e segurança

- Valores são assinados: entrada positiva, saída negativa. Não transforme o sinal apenas para apresentação antes de um cálculo.
- Linhas reais têm `id` positivo; linhas sintéticas e simuladas não existem no banco. Nunca envie PATCH/DELETE para uma linha sintética ou simulada.
- Consultas somente de leitura ao Supabase, como `SELECT`, inspeção de schema, migrations e advisors, podem ser feitas para diagnóstico. A disponibilidade de uma ferramenta de escrita no MCP não é autorização para usá-la.
- Antes de qualquer operação remota que possa mudar estado — `INSERT`, `UPDATE`, `DELETE`, `UPSERT`, RPC com efeito, `CREATE`/`ALTER`/`DROP`, grants, RLS, Auth, Storage, configuração ou execução de migration — peça confirmação explícita do mantenedor nesta conversa, com alvo e efeito informados. Não crie dados de teste no banco.
- Criação, edição, exclusão ou atualização real já são ações do usuário dentro da interface. Fora desse fluxo, não altere dados financeiros no Supabase sem autorização explícita.
- Preserve migrations aplicadas. Para uma alteração de esquema, crie uma migration nova e numerada; não reescreva migrations históricas.
- O mantenedor aplica migrations e ajusta dados diretamente no DataGrip; prepare a migration versionada quando ela for necessária, mas não a execute sem a confirmação explícita definida acima.
- Não exponha chaves de serviço nem contorne RLS. Toda atualização por nome deve usar a igualdade exata e `encodeURIComponent` no filtro PostgREST.

## Como concluir uma mudança

1. Mapeie a regra afetada em `docs/REGRAS.md` e atualize-a na mesma alteração.
2. Acrescente ou ajuste testes de regressão para o comportamento alterado. Prefira `node:test`, determinístico e sem criar lançamentos de teste no banco.
3. Documente no código a intenção de regras financeiras, arredondamentos, filtros e efeitos de linhas sintéticas. Comentários devem explicar o porquê, não reescrever a sintaxe.
4. Rode `node --test tests/*.test.js`, `git diff --check` e verificações de sintaxe aplicáveis. Informe precisamente o que foi validado; não alegue validação visual ou Supabase se ela não ocorreu.
   O atalho oficial é `node scripts/check.mjs`, que executa a validação local completa sem dependências adicionais, inclusive higiene textual definida no `.editorconfig`.
5. Depois de os testes passarem, faça commit e push para `origin/main` por padrão, salvo pedido contrário do usuário. Nunca inclua alterações alheias no commit.

## Preferências do mantenedor

- Prefira mudanças pontuais que preservem o restante do comportamento e dados diretamente editáveis no DataGrip.
- Não crie páginas HTML adicionais, testes em Python ou dados fictícios no banco apenas para testar.
- Para cada nova feature ou correção, regras e testes são parte obrigatória da entrega.
- Ao relatar a entrega, diferencie teste local, validação de navegador e validação integrada com Supabase.
- Mantenha dark mode definitivo, porém em tons de cinza escuro legíveis; evite preto quase puro dominando toda a interface.
- Prefira ícones a textos nos botões de ação. Todo ícone precisa de `title` e `aria-label`; texto visível só entra quando for indispensável para entendimento.
- Busque minimalismo: informação útil, textos curtos e formulários somente com campos necessários ao cadastro.
- No mobile, as tabelas são somente leitura e seguem a navegação restrita da Isabella, sem o bloco Crédito. O único fluxo de alteração permitido é cadastrar um novo lançamento; nunca exponha edição inline, seleção, duplicação, exclusão ou atualização por toque.
