-- =============================================================================
-- Seed: branches and default minimum staffing.
-- Users are NOT created here — use `npm run create-user` (scripts/create-user.ts),
-- which goes through the Supabase auth admin API.
-- =============================================================================

insert into public.branches (slug, name, address)
values
  ('de-pijp', 'Pizzadam De Pijp', 'Ferdinand Bolstraat 64h, 1072 LM Amsterdam'),
  ('zuid',    'Pizzadam Zuid',    'Heemstedestraat 17, 1059 CX Amsterdam')
on conflict (slug) do nothing;

-- Mon–Thu 4, Fri–Sat 6, Sun 4 (editable later in Ayarlar)
insert into public.min_staff_rules (branch_id, weekday, min_count)
select b.id, d.weekday, d.min_count
from public.branches b
cross join (values (1, 4), (2, 4), (3, 4), (4, 4), (5, 6), (6, 6), (7, 4)) as d(weekday, min_count)
on conflict (branch_id, weekday) do nothing;

select public.ensure_schedule_weeks();
