# Checklist de publicação manual

1. Rode `node scripts/check.mjs` e corrija qualquer falha.
2. Confira `git status` para não incluir `.claude/` ou alterações de outro trabalho.
3. Se houver migration nova, revise o SQL, aplique-a conscientemente no Supabase/DataGrip e valide RLS antes de publicar. Não aplique migrations apenas para testar a interface.
4. No navegador, valide login, carga, um lançamento de débito, um lançamento de crédito com fatura, filtros, Reserva de emergência e exportação CSV/JSON.
5. Confirme que simulações não aparecem no banco e que o download exporta somente o recorte filtrado.
6. Faça commit, envie para `origin/main` e confirme o deploy do GitHub Pages.
