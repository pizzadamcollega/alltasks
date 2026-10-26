-- D-43: employees ask for days on a future week ("Haftalık program"), the yönetici
-- approves / edits / rejects each request, then publishes the week. Approved
-- requests become rows on the plain `shifts` board (D-36); a future week's board
-- stays hidden from employees until it is published.

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.amsterdam_week_start() returns date
language sql stable set search_path = public as $$
  select date_trunc('week', (now() at time zone 'Europe/Amsterdam'))::date
$$;

-- -----------------------------------------------------------------------------
-- Published weeks
-- -----------------------------------------------------------------------------
create table public.shift_week_publications (
  branch_id     uuid not null references public.branches (id) on delete cascade,
  week_start    date not null check (extract(isodow from week_start) = 1),
  published_by  uuid references public.profiles (id) default auth.uid(),
  published_at  timestamptz not null default now(),
  primary key (branch_id, week_start)
);

alter table public.shift_week_publications enable row level security;
create policy shift_week_publications_select on public.shift_week_publications for select to authenticated
  using (public.is_branch_member(branch_id));
create policy shift_week_publications_write on public.shift_week_publications for all to authenticated
  using (public.is_branch_manager(branch_id))
  with check (public.is_branch_manager(branch_id));
revoke all on public.shift_week_publications from anon;
grant select, insert, delete on public.shift_week_publications to authenticated;

create or replace function public.is_week_published(p_branch uuid, p_week date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shift_week_publications
                 where branch_id = p_branch and week_start = date_trunc('week', p_week)::date)
$$;

-- Weeks that already have shifts were visible before this change — keep them so.
insert into public.shift_week_publications (branch_id, week_start, published_by)
select distinct branch_id, date_trunc('week', work_date)::date, null::uuid
from public.shifts
where work_date >= public.amsterdam_week_start() + 7
on conflict do nothing;

-- Employees see the current and past weeks always, future weeks once published.
drop policy shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated
  using (
    public.is_branch_manager(branch_id)
    or (public.is_branch_member(branch_id)
        and (work_date < public.amsterdam_week_start() + 7
             or public.is_week_published(branch_id, work_date)))
  );

-- -----------------------------------------------------------------------------
-- Requests
-- -----------------------------------------------------------------------------
create table public.shift_requests (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  work_date   date not null,
  start_time  time not null,
  note        text check (char_length(note) <= 200),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by  uuid references public.profiles (id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, user_id, work_date)
);
create index shift_requests_branch_date_idx on public.shift_requests (branch_id, work_date);

alter table public.shift_requests enable row level security;
create policy shift_requests_select on public.shift_requests for select to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(branch_id));
-- no write policies: all writes go through the RPCs below
revoke all on public.shift_requests from anon;
grant select on public.shift_requests to authenticated;

-- Employee: replace my open requests for one future, unpublished week.
-- p_days = [{"date":"2026-11-02","start":"16:45","note":"..."}]. Decided
-- (approved/rejected) days are left alone; pending days not in the list are withdrawn.
create or replace function public.submit_shift_requests(p_branch uuid, p_week date, p_days jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day jsonb;
  v_date date;
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.branch_members bm join public.profiles p on p.id = bm.user_id
    where bm.user_id = v_uid and bm.branch_id = p_branch and p.role = 'employee' and p.active
  ) then
    raise exception 'Bu şubede program isteği gönderemezsin' using errcode = '42501';
  end if;
  if p_week is null or extract(isodow from p_week) <> 1 then
    raise exception 'Geçersiz hafta' using errcode = '23514';
  end if;
  if p_week < public.amsterdam_week_start() + 7 then
    raise exception 'Sadece gelecek haftalar için istek gönderebilirsin' using errcode = '23514';
  end if;
  if p_week > public.amsterdam_week_start() + 56 then
    raise exception 'En fazla 8 hafta sonrası için istek gönderebilirsin' using errcode = '23514';
  end if;
  if public.is_week_published(p_branch, p_week) then
    raise exception 'Bu haftanın programı yayınlandı, istek kapandı' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_days, '[]'::jsonb)) <> 'array' then
    raise exception 'Geçersiz istek' using errcode = '23514';
  end if;

  delete from public.shift_requests r
  where r.branch_id = p_branch and r.user_id = v_uid and r.status = 'pending'
    and r.work_date between p_week and p_week + 6
    and r.work_date not in (
      select (d->>'date')::date from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) d
    );

  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    v_date := (v_day->>'date')::date;
    if v_date not between p_week and p_week + 6 then
      raise exception 'Gün seçilen haftada değil' using errcode = '23514';
    end if;
    insert into public.shift_requests (branch_id, user_id, work_date, start_time, note)
    values (p_branch, v_uid, v_date, (v_day->>'start')::time, nullif(trim(v_day->>'note'), ''))
    on conflict (branch_id, user_id, work_date) do update
      set start_time = excluded.start_time, note = excluded.note, updated_at = now()
      where shift_requests.status = 'pending';
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Manager: approve (optionally with another start time) or reject one request.
-- Approve puts the person on the board; reject takes them off again.
create or replace function public.decide_shift_request(p_request uuid, p_approve boolean, p_start time default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.shift_requests;
begin
  select * into r from public.shift_requests where id = p_request for update;
  if not found then
    raise exception 'İstek bulunamadı' using errcode = 'P0002';
  end if;
  if not public.is_branch_manager(r.branch_id) then
    raise exception 'Bu işlem için yetkin yok' using errcode = '42501';
  end if;

  if p_approve then
    update public.shift_requests
      set status = 'approved', start_time = coalesce(p_start, start_time),
          decided_by = auth.uid(), decided_at = now(), updated_at = now()
      where id = r.id;
    insert into public.shifts (branch_id, user_id, work_date, start_time)
    values (r.branch_id, r.user_id, r.work_date, coalesce(p_start, r.start_time))
    on conflict (branch_id, user_id, work_date) do update set start_time = excluded.start_time;
  else
    update public.shift_requests
      set status = 'rejected', decided_by = auth.uid(), decided_at = now(), updated_at = now()
      where id = r.id;
    delete from public.shifts
      where branch_id = r.branch_id and user_id = r.user_id and work_date = r.work_date;
  end if;
end $$;

-- Manager: approve every pending request of a week as asked. Returns how many.
create or replace function public.approve_pending_shift_requests(p_branch uuid, p_week date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count integer := 0;
begin
  if not public.is_branch_manager(p_branch) then
    raise exception 'Bu işlem için yetkin yok' using errcode = '42501';
  end if;
  for r in
    select id from public.shift_requests
    where branch_id = p_branch and status = 'pending' and work_date between p_week and p_week + 6
  loop
    perform public.decide_shift_request(r.id, true, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function public.submit_shift_requests(uuid, date, jsonb),
  public.decide_shift_request(uuid, boolean, time),
  public.approve_pending_shift_requests(uuid, date),
  public.is_week_published(uuid, date),
  public.amsterdam_week_start() from public, anon;
grant execute on function public.submit_shift_requests(uuid, date, jsonb),
  public.decide_shift_request(uuid, boolean, time),
  public.approve_pending_shift_requests(uuid, date),
  public.is_week_published(uuid, date),
  public.amsterdam_week_start() to authenticated;
