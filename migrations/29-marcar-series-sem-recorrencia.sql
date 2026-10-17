-- Marca como série os lançamentos que se repetem mas foram cadastrados sem Frequência e sem
-- recorrencia_id (antes do lote existir, ou um a um): cada série ganha freq e um
-- recorrencia_id novo, tirado da sequência na ordem da 1ª ocorrência (exige a migration 28).
-- Série = mesmo nome + categoria (sem diferenciar caixa nem espaço nas pontas) + mesmo
-- cred, só entre linhas com data, sem freq e sem recorrencia_id:
--   Mensal: 3 ou mais, exatamente uma por mês, em meses seguidos (o dia pode variar: conta
--           paga antes ou com vencimento móvel continua sendo a mesma série);
--   Anual:  2 ou mais, uma por ano, sempre no mesmo mês, em anos seguidos.
-- No Crédito o valor precisa ser sempre igual (parcela/assinatura): compras avulsas no
-- cartão que caíram uma vez por mês por acaso (ex.: estacionamento) ficam de fora. No
-- Débito o valor pode variar (água, evolução de obra).
-- Nunca entram: Investimento (Aporte/Resgate são ajustes do app), antecipação/pagamento de
-- fatura e Ajuste. Linhas que já têm freq ou recorrencia_id não são tocadas, então rodar de
-- novo não muda nada. Só altera freq e recorrencia_id; o histórico (migration 27) guarda o
-- antes de cada linha. Ao final, lista as séries marcadas.
begin;

do $$
begin
  if to_regprocedure('public.proxima_recorrencia()') is null then
    raise exception 'Aplique a migration 28 antes desta (nada foi alterado).';
  end if;
end $$;

-- Garante que a sequência não devolva um número já em uso.
select setval('public.fin_recorrencia_seq', greatest(
  (select coalesce(max(recorrencia_id), 0) from public.fin),
  (select last_value from public.fin_recorrencia_seq),
  1
));

create temporary table series_marcadas on commit drop as
with base as (
  select id, nome, categ, cred, data, valor,
         lower(trim(coalesce(nome, ''))) n, lower(trim(coalesce(categ, ''))) c
  from public.fin
  where freq is null and recorrencia_id is null and data is not null
    and coalesce(categ, '') !~* '(investimento|antecipa|pagamento fatura|ajuste)'
),
grupos as (
  select n, c, cred, count(*) qtd, min(data) primeira, max(data) ultima,
         count(distinct date_trunc('month', data)) meses,
         (extract(year from age(date_trunc('month', max(data)), date_trunc('month', min(data)))) * 12
          + extract(month from age(date_trunc('month', max(data)), date_trunc('month', min(data)))))::int + 1 meses_corridos,
         count(distinct extract(year from data)) anos,
         (extract(year from max(data)) - extract(year from min(data)))::int + 1 anos_corridos,
         count(distinct extract(month from data)) meses_do_ano,
         count(distinct valor) valores,
         min(nome) nome, min(categ) categ
  from base group by n, c, cred
)
select n, c, cred, nome, categ, qtd, primeira, ultima,
       case when qtd >= 3 and meses = qtd and meses_corridos = qtd then 'Mensal'
            when qtd >= 2 and anos = qtd and anos_corridos = qtd and meses_do_ano = 1 then 'Anual' end freq,
       null::integer recorrencia_id
from grupos
where (cred is not true or valores = 1)
  and ((qtd >= 3 and meses = qtd and meses_corridos = qtd)
       or (qtd >= 2 and anos = qtd and anos_corridos = qtd and meses_do_ano = 1));

-- Um número por série, na ordem da 1ª ocorrência (determinístico).
do $$
declare s record;
begin
  for s in select n, c, cred from series_marcadas order by primeira, n, c, cred loop
    update series_marcadas set recorrencia_id = nextval('public.fin_recorrencia_seq')::integer
    where (n, c, cred) is not distinct from (s.n, s.c, s.cred);
  end loop;
end $$;

update public.fin f
set freq = s.freq, recorrencia_id = s.recorrencia_id
from series_marcadas s
where f.freq is null and f.recorrencia_id is null and f.data is not null
  and lower(trim(coalesce(f.nome, ''))) = s.n
  and lower(trim(coalesce(f.categ, ''))) = s.c
  and f.cred is not distinct from s.cred
  and coalesce(f.categ, '') !~* '(investimento|antecipa|pagamento fatura|ajuste)';

select recorrencia_id, nome, categ, cred, freq, qtd, primeira, ultima
from series_marcadas order by recorrencia_id;

commit;
