# Decisões de arquitetura

## HTML estático único

O projeto permanece em um único `index.html` porque é publicado como site estático. Fragmentos HTML exigiriam build ou carregamento assíncrono e aumentariam a chance de scripts acessarem elementos antes de existirem.

## JavaScript clássico modular

Os arquivos em `js/` são scripts clássicos carregados em ordem explícita. Isso mantém a aplicação simples para editar, depurar no navegador e hospedar sem bundler. A ordem é um contrato testado.

## Estilo sem formatter pesado

O projeto usa `.editorconfig` e checagem nativa de tabs, espaços finais e newline final. ESLint e Prettier ficam fora por enquanto: em scripts clássicos globais eles exigiriam configuração extra e causariam um reformat amplo sem melhorar diretamente as regras financeiras.

## Linguagem visual

O tema é sempre escuro, mas em cinza grafite legível, sem uma tela predominantemente preta. Ações compactas usam ícones com `title` e rótulo acessível; textos permanecem curtos e só aparecem quando esclarecem uma decisão. Formulários recebem somente campos necessários. Não existe modo especial por e-mail ou titular: `Isabella` é uma categoria comum. No mobile, `modoSimples` não exibe o bloco Crédito, a interface é de consulta e cadastro e as tabelas não oferecem edição, seleção, duplicação, exclusão nem atualização.

## Fatura e Crédito

Há um cartão detalhado. A fatura é derivada de `fin.fatura`; o título e os cálculos usam o ciclo correto, enquanto a tabela Crédito é uma prévia visual do ciclo seguinte.

## Reserva de emergência

A meta usa nove ciclos futuros e somente despesas da categoria `Reserva emergência`. Para cada nome, um valor cadastrado no ciclo substitui a estimativa anterior; sem ocorrência, o último valor conhecido é projetado. Isso acomoda aumentos graduais, como Evolução Obra.

## Dados e banco

Supabase é a fonte de dados. O frontend não executa migrations nem cria dados fictícios para testar. Migrations históricas são preservadas, e mudanças de esquema exigem uma nova migration numerada. Consultas de leitura, inclusive `SELECT` e inspeção de schema, podem apoiar diagnóstico; qualquer ação remota que altere estado exige confirmação explícita prévia do mantenedor, mesmo se o MCP expuser a ferramenta.

## Documentação de produto

As regras financeiras vivem em `docs/REGRAS.md`, junto das decisões e do checklist de publicação. O `AGENTS.md` na raiz continua curto e operacional, para orientar manutenção e automação.
