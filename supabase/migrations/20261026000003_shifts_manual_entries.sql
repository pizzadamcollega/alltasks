-- Shift plan (yönetici fills the weekly board, everyone in the branch reads it)
-- and hand-entered time entries for employees.
-- D-36: `shifts` is deliberately separate from the Phase 6 `schedule_*` request/
-- draft/publish machinery — the owner wants a plain board the manager edits directly.
-- D-37: an employee may type in start/end themselves; such an entry is approved
-- immediately and flagged `manual`.
-- D-38: the Başla/Bitir timer is removed entirely — hand entry is the only way.

-- -----------------------------------------------------------------------------
-- Manual time entries
-- -----------------------------------------------------------------------------
alter table public.time_entries add column manual boolean not null default false;

create or replace function public.time_entries_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_mgr boolean;
begin
  if v_uid is not null then
    v_mgr := public.is_branch_manager(new.branch_id);

    if tg_op = 'INSERT' then
      if not v_mgr then
        if new.user_id <> v_uid then
          raise exception 'Başkası adına kayıt açamazsın' using errcode = '42501';
        end if;
        new.edited_by_employee := false;
        new.edited_by_manager := false;
        new.approved_by := null;
        new.approved_at := null;
        if new.end_at is null then
          -- D-38: the Başla/Bitir timer is gone; an employee always sends both times
          raise exception 'Başlangıç ve bitiş saatini gir' using errcode = '23514';
        else
          -- hand-entered start/end (D-37): counts as approved straight away,
          -- tagged `manual` so managers can tell it apart from the timer
          if new.start_at > now() + interval '5 minutes' or new.end_at > now() + interval '5 minutes' then
            raise exception 'Gelecek bir saat girilemez' using errcode = '23514';
          end if;
          if new.start_at < now() - interval '31 days' then
            raise exception 'En fazla 31 gün öncesi için kayıt girebilirsin' using errcode = '23514';
          end if;
          if exists (
            select 1 from public.time_entries t
            where t.user_id = new.user_id
              and tstzrange(t.start_at, coalesce(t.end_at, now())) && tstzrange(new.start_at, new.end_at)
          ) then
            raise exception 'Bu saatlerde zaten bir kaydın var' using errcode = '23514';
          end if;
          new.status := 'approved';
          new.manual := true;
        end if;
      else
        new.manual := coalesce(new.manual, false);
        new.edited_by_manager := (new.user_id <> v_uid);
        new.edited_by_employee := false;
      end if;

    else -- UPDATE
      if new.user_id is distinct from old.user_id or new.branch_id is distinct from old.branch_id then
        raise exception 'Kaydın sahibi veya şubesi değiştirilemez' using errcode = '42501';
      end if;

      if not v_mgr then
        if old.status = 'approved' then
          raise exception 'Onaylanmış kayıt değiştirilemez' using errcode = '42501';
        end if;
        if new.status = 'approved'
           or new.approved_by is distinct from old.approved_by
           or new.approved_at is distinct from old.approved_at
           or new.edited_by_manager is distinct from old.edited_by_manager then
          raise exception 'Bu alanları sadece patron değiştirebilir' using errcode = '42501';
        end if;
        if old.end_at is not null and new.end_at is null then
          raise exception 'Bitmiş kayıt yeniden açılamaz' using errcode = '23514';
        end if;
        if new.start_at > now() + interval '5 minutes'
           or (new.end_at is not null and new.end_at > now() + interval '5 minutes') then
          raise exception 'Gelecek bir saat girilemez' using errcode = '23514';
        end if;
        -- the first "Bitir" is not an edit; any later change of times is
        new.edited_by_employee := old.edited_by_employee
          or new.start_at is distinct from old.start_at
          or (old.end_at is not null and new.end_at is distinct from old.end_at);
      else
        if new.user_id <> v_uid
           and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at) then
          new.edited_by_manager := true;
        end if;
      end if;
    end if;

    -- approval bookkeeping (managers only reach here with status = approved)
    if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
      new.approved_by := v_uid;
      new.approved_at := now();
    elsif new.status <> 'approved' then
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;

  -- derived fields (always)
  new.work_date := public.compute_work_date(new.start_at, new.branch_id);
  new.rounded_minutes := public.round_minutes(new.start_at, new.end_at);
  if new.end_at is not null and new.status = 'open' then
    new.status := 'pending';
  end if;
  if new.end_at is null and new.status <> 'open' then
    raise exception 'Bitiş saati olmayan kayıt onaylanamaz' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- expose `manual` (appended last: create or replace view may only add columns at the end)
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
  where w.user_id = e.user_id and w.effective_from <= e.work_date
  order by w.effective_from desc limit 1
) r on true;

-- -----------------------------------------------------------------------------
-- Shift plan
-- -----------------------------------------------------------------------------
create table public.shifts (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  work_date   date not null,
  start_time  time not null,
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, user_id, work_date)
);
create index shifts_branch_date_idx on public.shifts (branch_id, work_date);

create or replace function public.shifts_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.branch_members bm
    join public.profiles p on p.id = bm.user_id
    where bm.user_id = new.user_id and bm.branch_id = new.branch_id
      and p.role = 'employee' and p.active
  ) then
    raise exception 'Bu kişi bu şubenin aktif çalışanı değil' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger shifts_before_write before insert or update on public.shifts
  for each row execute function public.shifts_before_write();

alter table public.shifts enable row level security;
create policy shifts_select on public.shifts for select to authenticated
  using (public.is_branch_member(branch_id));
create policy shifts_write on public.shifts for all to authenticated
  using (public.is_branch_manager(branch_id))
  with check (public.is_branch_manager(branch_id));

revoke all on public.shifts from anon;
grant select, insert, update, delete on public.shifts to authenticated;
revoke execute on function public.shifts_before_write() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- D-38: no more timer — clock_in/clock_out stay defined but are not callable
-- -----------------------------------------------------------------------------
revoke execute on function public.clock_in(uuid), public.clock_out() from authenticated;
