-- recorrencia_id é SEMPRE o próximo número da sequência fin_recorrencia_seq (migration 15),
-- nunca o id de um lançamento. O app gravava o id da 1ª parcela (ex.: 5297), fora da
-- numeração 1, 2, 3… que o banco usa; e a sequência ficou atrás do maior recorrencia_id já
-- gravado (nextval devolveria um número já em uso).
--   1. Alinha a sequência ao maior recorrencia_id existente (nunca volta atrás).
--   2. Cria public.proxima_recorrencia(): a única forma de o app obter um número novo.
--      Só o mantenedor chama (mesma conta que grava em fin, migration 20); anônimo não.
-- Não altera nenhuma linha de fin.
begin;

select setval('public.fin_recorrencia_seq', greatest(
  (select coalesce(max(recorrencia_id), 0) from public.fin),
  (select last_value from public.fin_recorrencia_seq),
  1
));

-- SECURITY DEFINER pra conta logada não precisar de grant na sequência; search_path vazio
-- pra nada resolver por objeto homônimo em outro schema.
create or replace function public.proxima_recorrencia() returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from '2f9bc201-9966-4f37-9963-2f4b9ddab849'::uuid then
    raise exception 'somente o mantenedor gera recorrencia_id' using errcode = '42501';
  end if;
  return nextval('public.fin_recorrencia_seq')::integer;
end;
$$;

revoke all on function public.proxima_recorrencia() from public, anon;
grant execute on function public.proxima_recorrencia() to authenticated;

commit;

notify pgrst, 'reload schema';
