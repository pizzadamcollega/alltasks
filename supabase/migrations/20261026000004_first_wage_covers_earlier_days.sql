-- D-41: an entry dated before someone's first wage row used to get no rate at
-- all (amount = null, shown as €0). With hand entry allowed up to 31 days back,
-- that hits every newly created account that logs a day worked before it was
-- created. Rule now: the latest rate effective on the work date, or — if the
-- entry predates every rate — the person's earliest rate.
create or replace view public.entry_earnings with (security_invoker = true) as
select
  e.id, e.user_id, e.branch_id, e.work_date, e.start_at, e.end_at, e.rounded_minutes,
  e.status, e.edited_by_employee, e.edited_by_manager, e.approved_by, e.approved_at,
  r.hourly_rate,
  case when e.rounded_minutes is null or r.hourly_rate is null then null
       else round(e.rounded_minutes / 60.0 * r.hourly_rate, 2) end as amount,
  e.manual
from public.time_entries e
left join lateral (
  select w.hourly_rate from public.wage_rates w
  where w.user_id = e.user_id
  order by (w.effective_from <= e.work_date) desc,
           case when w.effective_from <= e.work_date then w.effective_from end desc nulls last,
           w.effective_from asc
  limit 1
) r on true;
