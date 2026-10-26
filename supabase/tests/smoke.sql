-- =============================================================================
-- Smoke + RLS test for the Pizzadam schema.
-- Runs in ONE transaction and rolls back, so it leaves no data behind.
--
--   Plain Postgres:  psql -v ON_ERROR_STOP=1 -f supabase/tests/local_supabase_stub.sql \
--                    -f supabase/migrations/20261025000001_init.sql \
--                    -f supabase/seed.sql -f supabase/tests/smoke.sql
--   Local Supabase:  supabase db reset && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--                    -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
--
-- Every check is an ASSERT or an "expect error" block; the first failure aborts.
-- =============================================================================
\set ON_ERROR_STOP 1
begin;

-- ---------------------------------------------------------------- fixtures
create temp table t_ids (name text primary key, id uuid not null);
grant select on t_ids to authenticated, anon;

insert into t_ids values
  ('admin',  gen_random_uuid()), ('patron', gen_random_uuid()), ('patron_z', gen_random_uuid()),
  ('e1',     gen_random_uuid()), ('e2',     gen_random_uuid()), ('e3',       gen_random_uuid());

insert into auth.users (id, email)
select id, name || '@staff.pizzadam.invalid' from t_ids;

insert into public.profiles (id, full_name, username, role)
select id,
       case name when 'admin' then 'Admin Kişi' when 'patron' then 'Patron Pijp' when 'patron_z' then 'Patron Zuid'
                 when 'e1' then 'Ahmet Yılmaz' when 'e2' then 'Elif Kaya' else 'Sena Aksoy' end,
       'test.' || replace(name, '_', '.'),
       case when name = 'admin' then 'admin' when name like 'patron%' then 'patron' else 'employee' end::public.app_role
from t_ids;

insert into public.branch_members (user_id, branch_id)
select i.id, b.id from t_ids i join public.branches b on
  (i.name in ('patron', 'e1', 'e2') and b.slug = 'de-pijp') or
  (i.name in ('patron_z', 'e2', 'e3') and b.slug = 'zuid');

insert into public.wage_rates (user_id, hourly_rate, effective_from)
select id, rate, date '2026-01-01' from t_ids
join (values ('e1', 13.00), ('e2', 12.50), ('e3', 13.00)) r(n, rate) on r.n = t_ids.name;

-- ------------------------------------------------ 1. clock in / out (e1)
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;

select public.clock_in((select id from public.branches where slug = 'de-pijp'));

do $$ begin
  begin
    perform public.clock_in((select id from public.branches where slug = 'de-pijp'));
    raise exception 'EXPECTED_FAILURE_MISSING';
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'second clock_in must fail'; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '', true);   -- act as the server (no user)
-- move the open entry 3h back (same transaction → now() is constant)
update public.time_entries set start_at = now() - interval '3 hours 2 minutes'
 where user_id = (select id from t_ids where name = 'e1') and status = 'open';

select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
select public.clock_out();

do $$
declare e public.time_entries;
begin
  select * into e from public.time_entries where user_id = auth.uid();
  assert e.status = 'pending', 'clock_out → pending';
  assert e.rounded_minutes = 180, format('3h02m rounds to 180, got %s', e.rounded_minutes);
  assert not e.edited_by_employee, 'first Bitir is not an edit';
  assert (select count(*) from public.time_entry_audit
          where entry_id = e.id and action in ('clock_in', 'clock_out')) = 2, 'clock_in + clock_out audited';
end $$;

-- ------------------------------------------------ 2. privacy for an employee
do $$ begin
  assert (select count(*) from public.time_entries where user_id <> auth.uid()) = 0, 'e1 sees only own entries';
  assert (select count(*) from public.wage_rates) = 1, 'e1 sees only own wage';
  assert (select count(*) from public.profiles) = 3, format('e1 sees self + e2 + patron (shared branch), got %s', (select count(*) from public.profiles));
  assert (select count(*) from public.branches) = 1, 'e1 sees only de-pijp';
  assert (select amount from public.entry_earnings limit 1) = 39.00, 'earning = 3h × 13';
end $$;

-- ------------------------------------------------ 3. employee edits & limits
update public.time_entries set start_at = start_at - interval '10 minutes' where user_id = auth.uid();
do $$ begin
  assert (select edited_by_employee from public.time_entries where user_id = auth.uid()), 'correction flagged';
  assert (select rounded_minutes from public.time_entries where user_id = auth.uid()) = 190, 'rounded after edit';
  assert exists (select 1 from public.time_entry_audit where action = 'edit'), 'edit audited';
end $$;

do $$ begin
  begin
    update public.time_entries set status = 'approved' where user_id = auth.uid();
    raise exception 'EXPECTED_FAILURE_MISSING';
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'employee must not approve'; end if;
  end;
  begin
    update public.profiles set full_name = 'Hacker' where id = auth.uid();
    raise exception 'EXPECTED_FAILURE_MISSING';
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'employee must not rename self'; end if;
  end;
end $$;
update public.profiles set theme = 'dark' where id = auth.uid();

-- ------------------------------------------------ 4. patron approves & edits
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron'))::text, true);
set local role authenticated;

do $$
declare v_id uuid; n int;
begin
  select id into v_id from public.time_entries where user_id = (select id from t_ids where name = 'e1');
  assert v_id is not null, 'patron sees e1 entry';
  n := public.approve_entries(array[v_id]);
  assert n = 1, 'one approved';
  assert (select approved_by from public.time_entries where id = v_id) = auth.uid(), 'approved_by set';
  update public.time_entries set end_at = end_at + interval '5 minutes' where id = v_id;
  assert (select edited_by_manager from public.time_entries where id = v_id), 'manager edit flagged';
  assert (select status from public.time_entries where id = v_id) = 'approved', 'stays approved';
  assert (select count(*) from public.wage_rates) = 2, 'patron sees wages of de-pijp employees (e1, e2)';
end $$;

-- manual entry past midnight → previous business day
insert into public.time_entries (user_id, branch_id, start_at, end_at)
values ((select id from t_ids where name = 'e2'), (select id from public.branches where slug = 'de-pijp'),
        timestamptz '2026-10-18 01:30 Europe/Amsterdam', timestamptz '2026-10-18 02:47 Europe/Amsterdam');
do $$
declare e public.time_entries;
begin
  select * into e from public.time_entries where user_id = (select id from t_ids where name = 'e2');
  assert e.work_date = date '2026-10-17', format('01:30 belongs to previous day, got %s', e.work_date);
  assert e.rounded_minutes = 75, format('1h17m → 75, got %s', e.rounded_minutes);
  assert e.status = 'pending', 'manual entry pending';
end $$;

do $$ begin
  begin
    insert into public.branch_members (user_id, branch_id)
    values ((select id from t_ids where name = 'patron_z'), (select id from public.branches where slug = 'de-pijp'));
    raise exception 'EXPECTED_FAILURE_MISSING';
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'patron must not add another patron'; end if;
  end;
end $$;

-- ------------------------------------------------ 5. e1 sees the manager edit, cannot touch approved
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
do $$ begin
  assert exists (select 1 from public.notifications where kind = 'entry_edited_by_manager'), 'e1 notified about edit';
  begin
    update public.time_entries set start_at = start_at - interval '1 hour' where user_id = auth.uid();
    raise exception 'EXPECTED_FAILURE_MISSING';
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'approved entry must be locked for employee'; end if;
  end;
end $$;

-- ------------------------------------------------ 6. other branch patron isolation
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron_z'))::text, true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.time_entries) = 0, 'zuid patron sees no de-pijp entries';
  assert (select count(*) from public.wage_rates) = 2, 'zuid patron sees wages of e2 + e3';
  assert (select count(*) from public.branches) = 1, 'zuid patron sees one branch';
end $$;

-- ------------------------------------------------ 7. admin sees everything
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'admin'))::text, true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.branches) = 2, 'admin sees both branches';
  assert (select count(*) from public.time_entries) = 2, 'admin sees all entries';
  assert (select count(*) from public.wage_rates) = 3, 'admin sees all wages';
end $$;

-- ------------------------------------------------ 8. wage history
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.wage_rates (user_id, hourly_rate, effective_from)
values ((select id from t_ids where name = 'e2'), 14.00, date '2026-10-25');
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e2'))::text, true);
set local role authenticated;
do $$ begin
  assert (select hourly_rate from public.entry_earnings where work_date = date '2026-10-17') = 12.50,
    'entry on 17 Oct still uses the old 12.50 rate';
  assert (select amount from public.entry_earnings where work_date = date '2026-10-17') = 15.63, '75 min × 12.50 = 15.63';
end $$;

-- ------------------------------------------------ 9. payments visibility
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron'))::text, true);
set local role authenticated;
insert into public.payments (user_id, branch_id, month, kind, amount, visible_to_employee)
values ((select id from t_ids where name = 'e1'), (select id from public.branches where slug = 'de-pijp'),
        date '2026-10-01', 'advance', 150, false);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
do $$ begin assert (select count(*) from public.payments) = 0, 'hidden payment invisible'; end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron'))::text, true);
set local role authenticated;
update public.payments set visible_to_employee = true;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.payments) = 1, 'visible payment shown';
  assert exists (select 1 from public.notifications where kind = 'payment_recorded'), 'payment notification';
end $$;

-- ------------------------------------------------ 10. schedule: template → requests → draft → publish
reset role;
select set_config('request.jwt.claims', '', true);
select public.run_schedule_jobs();       -- creates weeks; current week (deadline passed) is drafted

create temp table t_weeks as
select (select w.id from public.schedule_weeks w join public.branches b on b.id = w.branch_id
         where b.slug = 'de-pijp' and w.week_start = public.local_today() - (extract(isodow from public.local_today())::int - 1)) as cur,
       (select w.id from public.schedule_weeks w join public.branches b on b.id = w.branch_id
         where b.slug = 'de-pijp' and w.week_start = public.local_today() - (extract(isodow from public.local_today())::int - 1) + 14) as fut;
grant select on t_weeks to authenticated;

-- patron fills and publishes the current week: e1 Mon + Wed, e2 Tue
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron'))::text, true);
set local role authenticated;
insert into public.schedule_assignments (week_id, branch_id, user_id, work_date)
select t.cur, (select id from public.branches where slug = 'de-pijp'), i.id, w.week_start + d
from t_weeks t join public.schedule_weeks w on w.id = t.cur
join (values ('e1', 0), ('e1', 2), ('e2', 1)) x(n, d) on true
join t_ids i on i.name = x.n;
select public.publish_week((select cur from t_weeks));

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
do $$
declare v_t date[]; v_ws date;
begin
  select week_start into v_ws from public.schedule_weeks where id = (select fut from t_weeks);
  assert (select status from public.schedule_weeks where id = (select fut from t_weeks)) = 'collecting', 'future week collecting';
  v_t := public.template_days((select fut from t_weeks));
  assert v_t = array[v_ws, v_ws + 2], format('template = Mon+Wed, got %s', v_t);
  -- e1 changes: Mon + Fri
  insert into public.schedule_requests (week_id, user_id, kind, days)
  values ((select fut from t_weeks), auth.uid(), 'change', array[v_ws + 4, v_ws]);
  assert (select days from public.schedule_requests where user_id = auth.uid() and week_id = (select fut from t_weeks)) = array[v_ws, v_ws + 4], 'days sorted';
  assert exists (select 1 from public.notifications where kind = 'program_published'), 'e1 told current week published';
end $$;

-- deadline passes
reset role;
select set_config('request.jwt.claims', '', true);
update public.schedule_weeks set deadline_at = now() - interval '1 minute' where id = (select fut from t_weeks);
select public.close_due_weeks();

do $$
declare v_ws date;
begin
  select week_start into v_ws from public.schedule_weeks where id = (select fut from t_weeks);
  assert (select status from public.schedule_weeks where id = (select fut from t_weeks)) = 'draft', 'drafted';
  assert (select array_agg(work_date order by work_date) from public.schedule_assignments
          where week_id = (select fut from t_weeks) and user_id = (select id from t_ids where name = 'e1'))
         = array[v_ws, v_ws + 4], 'e1 gets requested days';
  assert (select array_agg(work_date) from public.schedule_assignments
          where week_id = (select fut from t_weeks) and user_id = (select id from t_ids where name = 'e2'))
         = array[v_ws + 1], 'e2 (no answer) gets template Tue';
  assert (select auto from public.schedule_requests
          where week_id = (select fut from t_weeks) and user_id = (select id from t_ids where name = 'e2')), 'auto request';
  assert exists (select 1 from public.notifications n join t_ids i on i.id = n.user_id
                 where i.name = 'patron' and n.kind = 'week_draft_ready'), 'patron told draft ready';
end $$;

-- employees cannot see a draft; requests are closed
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.schedule_assignments where week_id = (select fut from t_weeks)) = 0, 'draft hidden from employee';
  begin
    update public.schedule_requests set days = '{}' where week_id = (select fut from t_weeks) and user_id = auth.uid();
    raise exception 'EXPECTED_FAILURE_MISSING';
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'requests must be closed after deadline'; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron'))::text, true);
set local role authenticated;
select public.publish_week((select fut from t_weeks));

-- ------------------------------------------------ 11. swap: e1 gives Fri to e2, e2 accepts, patron reverts
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
do $$
declare v_ws date; v_swap uuid;
begin
  select week_start into v_ws from public.schedule_weeks where id = (select fut from t_weeks);
  assert (select count(*) from public.schedule_assignments where week_id = (select fut from t_weeks)) = 3, 'published week visible';
  v_swap := public.request_swap((select fut from t_weeks), v_ws + 4, (select id from t_ids where name = 'e2'));
  assert v_swap is not null, 'swap created';
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e2'))::text, true);
set local role authenticated;
do $$
declare v_ws date;
begin
  select week_start into v_ws from public.schedule_weeks where id = (select fut from t_weeks);
  assert exists (select 1 from public.notifications where kind = 'swap_requested'), 'e2 notified';
  perform public.respond_swap((select id from public.schedule_swaps limit 1), true);
  assert exists (select 1 from public.schedule_assignments where user_id = auth.uid() and work_date = v_ws + 4), 'e2 now works Fri';
  assert not exists (select 1 from public.schedule_assignments
                     where user_id = (select id from t_ids where name = 'e1') and work_date = v_ws + 4), 'e1 no longer Fri';
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron'))::text, true);
set local role authenticated;
do $$
declare v_ws date;
begin
  select week_start into v_ws from public.schedule_weeks where id = (select fut from t_weeks);
  assert exists (select 1 from public.notifications where kind = 'swap_done' and user_id = auth.uid()), 'patron told about swap';
  perform public.revert_swap((select id from public.schedule_swaps limit 1));
  assert exists (select 1 from public.schedule_assignments
                 where user_id = (select id from t_ids where name = 'e1') and work_date = v_ws + 4), 'reverted to e1';
end $$;

-- ------------------------------------------------ 12. leave requests
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
insert into public.leave_requests (user_id, kind, start_date, end_date, status)
values (auth.uid(), 'tatil', public.local_today() + 40, public.local_today() + 45, 'approved');  -- status is forced to pending
do $$ begin
  assert (select status from public.leave_requests) = 'pending', 'employee cannot self-approve';
  begin
    update public.leave_requests set status = 'approved';
    -- RLS hides the row from an UPDATE by the owner → 0 rows, so check the value instead
    if (select status from public.leave_requests) = 'approved' then
      raise exception 'EXPECTED_FAILURE_MISSING';
    end if;
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'employee must not decide leave'; end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'patron'))::text, true);
set local role authenticated;
do $$ begin
  assert exists (select 1 from public.notifications where kind = 'leave_requested' and user_id = auth.uid()), 'patron told';
  update public.leave_requests set status = 'approved', decision_note = 'İyi tatiller';
  assert (select decided_by from public.leave_requests) = auth.uid(), 'decided_by set';
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_ids where name = 'e1'))::text, true);
set local role authenticated;
do $$ begin
  assert exists (select 1 from public.notifications where kind = 'leave_decided'), 'e1 told about decision';
end $$;

-- ------------------------------------------------ 13. anonymous sees nothing
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  begin
    perform count(*) from public.branches;
    raise exception 'EXPECTED_FAILURE_MISSING';
  exception when others then
    if sqlerrm = 'EXPECTED_FAILURE_MISSING' then raise exception 'anon must not read branches'; end if;
  end;
end $$;

reset role;
select 'ALL SMOKE TESTS PASSED' as result;
rollback;
