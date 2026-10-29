-- D-45..D-49: staff duties (kasacı / bezorgd / usta), one kasacı per day, the
-- two-step review flow (employee → kasacı → yönetici) for hours, material
-- reports and the cash count, and the yönetici's day close (locks the day).
--
-- Review state changes never happen through plain table writes: the RPCs
-- below flip a transaction-local flag (`pz.review`) and the triggers only
-- accept status / reviewer columns from a write that carries it. Every RPC
-- re-checks who may review what, so RLS on the tables stays simple.

set check_function_bodies = off;

-- =============================================================================
-- Duties on profiles
-- =============================================================================
alter table public.profiles add column duties public.staff_duty[] not null default '{}';

create or replace function public.profiles_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  new.updated_at := now();
  -- D-45: an employee always has at least one duty (checked on change only, so
  -- accounts created before duties existed keep working until they get one)
  if new.duties is distinct from old.duties and new.role = 'employee' and cardinality(new.duties) = 0 then
    raise exception 'En az bir görev seç' using errcode = '23514';
  end if;
  if v_uid is null then return new; end if;           -- service role / server
  if new.username is distinct from old.username then
    raise exception 'Kullanıcı adı sadece sunucu tarafında değiştirilebilir' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Rol değişikliği sadece admin tarafından yapılabilir' using errcode = '42501';
  end if;
  if old.id = v_uid and not public.is_admin() then
    -- self-service: only the theme
    if (new.full_name, new.active, new.started_on, new.duties)
       is distinct from (old.full_name, old.active, old.started_on, old.duties) then
      raise exception 'Sadece tema tercihini değiştirebilirsin' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- =============================================================================
-- Helpers
-- =============================================================================
create or replace function public.business_today(p_branch uuid) returns date
language sql stable security definer set search_path = public as $$
  select public.compute_work_date(now(), p_branch)
$$;

create or replace function public.has_duty(p_duty public.staff_duty) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and active and p_duty = any(duties))
$$;

-- p_user is that day's kasacı: flagged on the board and still holds the duty
create or replace function public.user_is_day_cashier(p_branch uuid, p_date date, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shifts s
    join public.profiles p on p.id = s.user_id
    where s.branch_id = p_branch and s.work_date = p_date and s.user_id = p_user
      and s.is_cashier and p.active and 'kasaci' = any(p.duties))
$$;

create or replace function public.is_day_cashier(p_branch uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_is_day_cashier(p_branch, p_date, auth.uid())
$$;

-- review RPCs set this for their own transaction only
create or replace function public.in_review() returns boolean
language sql stable as $$
  select coalesce(current_setting('pz.review', true), '') = 'on'
$$;

-- =============================================================================
-- Kasacı of the day (a flag on the weekly board)
-- =============================================================================
alter table public.shifts add column is_cashier boolean not null default false;
create unique index shifts_one_cashier_per_day on public.shifts (branch_id, work_date) where is_cashier;

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
  if new.is_cashier and not exists (
    select 1 from public.profiles where id = new.user_id and 'kasaci' = any(duties)
  ) then
    raise exception 'Bu kişinin kasacı görevi yok' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Manager: make p_user the day's kasacı (null = nobody). They need a shift that day.
create or replace function public.set_day_cashier(p_branch uuid, p_date date, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_branch_manager(p_branch) then
    raise exception 'Bu işlem için yetkin yok' using errcode = '42501';
  end if;
  update public.shifts set is_cashier = false
   where branch_id = p_branch and work_date = p_date and is_cashier
     and user_id is distinct from p_user;
  if p_user is not null then
    update public.shifts set is_cashier = true
     where branch_id = p_branch and work_date = p_date and user_id = p_user;
    if not found then
      raise exception 'Bu kişinin o gün vardiyası yok, önce programa ekle' using errcode = '23514';
    end if;
  end if;
end $$;

-- =============================================================================
-- Day close
-- =============================================================================
create table public.day_closings (
  branch_id    uuid not null references public.branches (id) on delete cascade,
  work_date    date not null,
  closed       boolean not null default true,
  closed_by    uuid references public.profiles (id) on delete set null,
  closed_at    timestamptz not null default now(),
  reopened_by  uuid references public.profiles (id) on delete set null,
  reopened_at  timestamptz,
  snapshot     jsonb not null default '{}'::jsonb,
  primary key (branch_id, work_date)
);

create or replace function public.is_day_closed(p_branch uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.day_closings
                 where branch_id = p_branch and work_date = p_date and closed)
$$;

-- =============================================================================
-- Time entries: open again (start now, end later), kasacı → yönetici review
-- =============================================================================
alter table public.time_entries
  add column cashier_approved_by uuid references public.profiles (id) on delete set null,
  add column cashier_approved_at timestamptz,
  add column returned_by uuid references public.profiles (id) on delete set null,
  add column returned_at timestamptz,
  add column return_note text check (char_length(return_note) <= 300);

alter table public.time_entry_audit drop constraint time_entry_audit_action_check;
alter table public.time_entry_audit add constraint time_entry_audit_action_check
  check (action in ('clock_in', 'clock_out', 'manual_create', 'edit', 'approve', 'unapprove',
                    'cashier_approve', 'return', 'resend'));

create or replace function public.time_entries_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_mgr boolean;
begin
  -- derived fields first: the day lock looks at the (new) business day
  new.work_date := public.compute_work_date(new.start_at, new.branch_id);
  new.rounded_minutes := public.round_minutes(new.start_at, new.end_at);

  if public.is_day_closed(new.branch_id, new.work_date)
     or (tg_op = 'UPDATE' and public.is_day_closed(old.branch_id, old.work_date)) then
    raise exception 'Bu gün kapatıldı, önce yönetici günü yeniden açmalı' using errcode = '42501';
  end if;

  if v_uid is not null and not public.in_review() then
    v_mgr := public.is_branch_manager(new.branch_id);

    if tg_op = 'INSERT' then
      if not v_mgr then
        if new.user_id <> v_uid then
          raise exception 'Başkası adına kayıt açamazsın' using errcode = '42501';
        end if;
        if new.start_at > now() + interval '5 minutes'
           or (new.end_at is not null and new.end_at > now() + interval '5 minutes') then
          raise exception 'Gelecek bir saat girilemez' using errcode = '23514';
        end if;
        if new.start_at < now() - interval '31 days' then
          raise exception 'En fazla 31 gün öncesi için kayıt girebilirsin' using errcode = '23514';
        end if;
        if exists (
          select 1 from public.time_entries t
          where t.user_id = new.user_id
            and tstzrange(t.start_at, coalesce(t.end_at, now()))
                && tstzrange(new.start_at, coalesce(new.end_at, greatest(now(), new.start_at + interval '1 minute')))
        ) then
          raise exception 'Bu saatlerde zaten bir kaydın var' using errcode = '23514';
        end if;
        -- D-46: start now, end later; nothing is approved on entry any more
        new.status := case when new.end_at is null then 'open' else 'pending' end::public.entry_status;
        new.manual := new.end_at is not null;
        new.edited_by_employee := false;
        new.edited_by_manager := false;
        new.return_note := null;
      else
        -- a manager may add a finished entry as approved (they are the reviewer)
        if new.status not in ('open', 'pending', 'approved') then
          new.status := 'pending';
        end if;
        new.manual := coalesce(new.manual, false);
        new.edited_by_manager := (new.user_id <> v_uid);
        new.edited_by_employee := false;
      end if;

    else -- UPDATE
      if new.user_id is distinct from old.user_id or new.branch_id is distinct from old.branch_id then
        raise exception 'Kaydın sahibi veya şubesi değiştirilemez' using errcode = '42501';
      end if;

      if not v_mgr then
        if old.status in ('approved', 'cashier_approved') then
          raise exception 'Onaylanmış kayıt değiştirilemez' using errcode = '42501';
        end if;
        if old.end_at is not null and new.end_at is null then
          raise exception 'Bitmiş kayıt yeniden açılamaz' using errcode = '23514';
        end if;
        if new.start_at > now() + interval '5 minutes'
           or (new.end_at is not null and new.end_at > now() + interval '5 minutes') then
          raise exception 'Gelecek bir saat girilemez' using errcode = '23514';
        end if;
        -- reviewer columns belong to the reviewers
        new.approved_by := old.approved_by;
        new.approved_at := old.approved_at;
        new.cashier_approved_by := old.cashier_approved_by;
        new.cashier_approved_at := old.cashier_approved_at;
        new.returned_by := old.returned_by;
        new.returned_at := old.returned_at;
        new.return_note := old.return_note;
        new.edited_by_manager := old.edited_by_manager;
        new.manual := old.manual;
        -- finishing, fixing or resending a returned entry always lands at the kasacı
        new.status := case when new.end_at is null then 'open' else 'pending' end::public.entry_status;
        -- the first "Bitir" is not an edit; any later change of times is
        new.edited_by_employee := old.edited_by_employee
          or new.start_at is distinct from old.start_at
          or (old.end_at is not null and new.end_at is distinct from old.end_at);
      else
        if new.status is distinct from old.status then
          raise exception 'Onay durumu sadece onay ekranından değişir' using errcode = '42501';
        end if;
        if new.user_id <> v_uid
           and (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at) then
          new.edited_by_manager := true;
        end if;
      end if;
    end if;
  end if;

  if new.end_at is not null and new.status = 'open' then
    new.status := 'pending';
  end if;
  if new.end_at is null and new.status <> 'open' then
    raise exception 'Bitiş saati olmayan kayıt onaylanamaz' using errcode = '23514';
  end if;

  -- reviewer bookkeeping on every status change
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'approved' then
      new.approved_by := v_uid;
      new.approved_at := now();
    elsif new.status = 'cashier_approved' then
      new.cashier_approved_by := v_uid;
      new.cashier_approved_at := now();
      new.approved_by := null;
      new.approved_at := null;
    elsif new.status = 'returned' then
      new.returned_by := v_uid;
      new.returned_at := now();
      new.cashier_approved_by := null;
      new.cashier_approved_at := null;
      new.approved_by := null;
      new.approved_at := null;
    else
      new.cashier_approved_by := null;
      new.cashier_approved_at := null;
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.time_entries_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_action text;
  v_times_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_action := case when new.end_at is null then 'clock_in' else 'manual_create' end;
    insert into public.time_entry_audit (entry_id, action, changed_by, new_start, new_end, new_status)
    values (new.id, v_action, v_uid, new.start_at, new.end_at, new.status);
    return null;
  end if;

  v_times_changed := new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at;
  if not v_times_changed and new.status = old.status then return null; end if;

  v_action := case
    when old.end_at is null and new.end_at is not null and new.start_at = old.start_at then 'clock_out'
    when v_times_changed then 'edit'
    when new.status = 'approved' then 'approve'
    when new.status = 'cashier_approved' then 'cashier_approve'
    when new.status = 'returned' then 'return'
    when old.status = 'returned' then 'resend'
    else 'unapprove' end;

  insert into public.time_entry_audit
    (entry_id, action, changed_by, old_start, old_end, new_start, new_end, old_status, new_status)
  values (new.id, v_action, v_uid, old.start_at, old.end_at, new.start_at, new.end_at, old.status, new.status);

  if v_uid is not null and v_uid <> new.user_id and v_times_changed then
    perform public.notify(
      new.user_id, new.branch_id, 'entry_edited_by_manager', 'Mesai kaydın düzenlendi',
      format('%s tarihli kaydın yönetici tarafından güncellendi: %s – %s',
             to_char(new.work_date, 'DD.MM.YYYY'),
             to_char(new.start_at at time zone public.app_tz(), 'HH24:MI'),
             to_char(new.end_at at time zone public.app_tz(), 'HH24:MI')),
      '/' || public.branch_slug(new.branch_id) || '/gecmis',
      jsonb_build_object('entry_id', new.id));
  end if;
  if new.status = 'returned' and old.status <> 'returned' then
    perform public.notify(
      new.user_id, new.branch_id, 'entry_returned', 'Mesai kaydın geri gönderildi',
      new.return_note, '/' || public.branch_slug(new.branch_id),
      jsonb_build_object('entry_id', new.id));
  end if;
  return null;
end $$;

-- closed days are read-only, deletes included
create or replace function public.day_lock_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_day_closed(old.branch_id, old.work_date) then
    raise exception 'Bu gün kapatıldı, önce yönetici günü yeniden açmalı' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger time_entries_day_lock before delete on public.time_entries
  for each row execute function public.day_lock_before_delete();

-- the day's kasacı reads that day's entries of the branch
drop policy time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries for select to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(branch_id)
         or public.is_day_cashier(branch_id, work_date));

-- =============================================================================
-- Usta material report (dough S/M/L: + extra, − short) and the cash count
-- =============================================================================
create table public.material_reports (
  id                   uuid primary key default gen_random_uuid(),
  branch_id            uuid not null references public.branches (id) on delete cascade,
  user_id              uuid not null references public.profiles (id) on delete cascade,
  work_date            date not null,
  dough_s              integer not null default 0 check (dough_s between -999 and 999),
  dough_m              integer not null default 0 check (dough_m between -999 and 999),
  dough_l              integer not null default 0 check (dough_l between -999 and 999),
  note                 text check (char_length(note) <= 500),
  status               public.review_status not null default 'pending',
  cashier_approved_by  uuid references public.profiles (id) on delete set null,
  cashier_approved_at  timestamptz,
  approved_by          uuid references public.profiles (id) on delete set null,
  approved_at          timestamptz,
  returned_by          uuid references public.profiles (id) on delete set null,
  returned_at          timestamptz,
  return_note          text check (char_length(return_note) <= 300),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (branch_id, user_id, work_date)
);
create index material_reports_branch_date_idx on public.material_reports (branch_id, work_date);

create table public.cash_counts (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches (id) on delete cascade,
  user_id        uuid references public.profiles (id) on delete set null,
  work_date      date not null,
  opening_float  numeric(10,2) not null default 0 check (opening_float >= 0 and opening_float < 100000),
  online         numeric(10,2) not null default 0 check (online >= 0 and online < 1000000),
  kiosk          numeric(10,2) not null default 0 check (kiosk >= 0 and kiosk < 1000000),
  contant        numeric(10,2) not null default 0 check (contant >= 0 and contant < 1000000),
  total          numeric(10,2) generated always as (online + kiosk + contant) stored,
  note           text check (char_length(note) <= 500),
  status         public.review_status not null default 'pending'
                   check (status <> 'cashier_approved'),
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz,
  returned_by    uuid references public.profiles (id) on delete set null,
  returned_at    timestamptz,
  return_note    text check (char_length(return_note) <= 300),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (branch_id, work_date)
);

create or replace function public.material_reports_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.is_day_closed(new.branch_id, new.work_date)
     or (tg_op = 'UPDATE' and public.is_day_closed(old.branch_id, old.work_date)) then
    raise exception 'Bu gün kapatıldı, önce yönetici günü yeniden açmalı' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.user_id, new.branch_id, new.work_date)
                          is distinct from (old.user_id, old.branch_id, old.work_date) then
    raise exception 'Raporun sahibi, şubesi veya günü değiştirilemez' using errcode = '42501';
  end if;

  if v_uid is not null and not public.in_review() then
    if not public.is_branch_manager(new.branch_id) then
      if new.user_id <> v_uid then
        raise exception 'Başkası adına rapor gönderemezsin' using errcode = '42501';
      end if;
      if not public.has_duty('usta') or not public.is_branch_member(new.branch_id) then
        raise exception 'Malzeme raporunu sadece usta gönderebilir' using errcode = '42501';
      end if;
      if new.work_date not between public.business_today(new.branch_id) - 1
                               and public.business_today(new.branch_id) then
        raise exception 'Sadece bugün veya dün için rapor gönderebilirsin' using errcode = '23514';
      end if;
      if tg_op = 'UPDATE' and old.status in ('cashier_approved', 'approved') then
        raise exception 'Onaylanmış rapor değiştirilemez' using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      raise exception 'Onay durumu sadece onay ekranından değişir' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.return_note := null;
    else
      new.cashier_approved_by := old.cashier_approved_by;
      new.cashier_approved_at := old.cashier_approved_at;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.returned_by := old.returned_by;
      new.returned_at := old.returned_at;
      new.return_note := old.return_note;
    end if;
    -- any send or fix by the owner goes (back) to the kasacı
    if tg_op = 'INSERT' or new.user_id = v_uid then
      new.status := 'pending';
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'approved' then
      new.approved_by := v_uid;
      new.approved_at := now();
    elsif new.status = 'cashier_approved' then
      new.cashier_approved_by := v_uid;
      new.cashier_approved_at := now();
      new.approved_by := null;
      new.approved_at := null;
    elsif new.status = 'returned' then
      new.returned_by := v_uid;
      new.returned_at := now();
      new.cashier_approved_by := null;
      new.cashier_approved_at := null;
      new.approved_by := null;
      new.approved_at := null;
    else
      new.cashier_approved_by := null;
      new.cashier_approved_at := null;
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger material_reports_before_write before insert or update on public.material_reports
  for each row execute function public.material_reports_before_write();
create trigger material_reports_day_lock before delete on public.material_reports
  for each row execute function public.day_lock_before_delete();

create or replace function public.cash_counts_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.is_day_closed(new.branch_id, new.work_date)
     or (tg_op = 'UPDATE' and public.is_day_closed(old.branch_id, old.work_date)) then
    raise exception 'Bu gün kapatıldı, önce yönetici günü yeniden açmalı' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.branch_id, new.work_date) is distinct from (old.branch_id, old.work_date) then
    raise exception 'Kasa sayımının şubesi veya günü değiştirilemez' using errcode = '42501';
  end if;

  if v_uid is not null and not public.in_review() then
    if not public.is_branch_manager(new.branch_id) then
      -- D-48: only the day's kasacı counts the till; a replacement kasacı takes it over
      if not public.is_day_cashier(new.branch_id, new.work_date) then
        raise exception 'Kasa sayımını sadece günün kasacısı girebilir' using errcode = '42501';
      end if;
      if tg_op = 'UPDATE' and old.status = 'approved' then
        raise exception 'Onaylanmış kasa sayımı değiştirilemez' using errcode = '42501';
      end if;
      new.user_id := v_uid;
      new.status := 'pending';
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
      raise exception 'Onay durumu sadece onay ekranından değişir' using errcode = '42501';
    elsif tg_op = 'INSERT' then
      new.status := 'pending';
    end if;
    if tg_op = 'INSERT' then
      new.return_note := null;
    else
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.returned_by := old.returned_by;
      new.returned_at := old.returned_at;
      new.return_note := old.return_note;
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'approved' then
      new.approved_by := v_uid;
      new.approved_at := now();
    elsif new.status = 'returned' then
      new.returned_by := v_uid;
      new.returned_at := now();
      new.approved_by := null;
      new.approved_at := null;
    else
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger cash_counts_before_write before insert or update on public.cash_counts
  for each row execute function public.cash_counts_before_write();
create trigger cash_counts_day_lock before delete on public.cash_counts
  for each row execute function public.day_lock_before_delete();

alter table public.material_reports enable row level security;
alter table public.cash_counts      enable row level security;
alter table public.day_closings     enable row level security;

create policy material_reports_select on public.material_reports for select to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(branch_id)
         or public.is_day_cashier(branch_id, work_date));
create policy material_reports_insert on public.material_reports for insert to authenticated
  with check ((user_id = auth.uid() and public.is_branch_member(branch_id))
              or public.is_branch_manager(branch_id));
create policy material_reports_update on public.material_reports for update to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(branch_id))
  with check (user_id = auth.uid() or public.is_branch_manager(branch_id));
create policy material_reports_delete on public.material_reports for delete to authenticated
  using (public.is_branch_manager(branch_id)
         or (user_id = auth.uid() and status in ('pending', 'returned')));

create policy cash_counts_select on public.cash_counts for select to authenticated
  using (public.is_branch_manager(branch_id) or public.is_day_cashier(branch_id, work_date));
create policy cash_counts_insert on public.cash_counts for insert to authenticated
  with check (public.is_branch_manager(branch_id) or public.is_day_cashier(branch_id, work_date));
create policy cash_counts_update on public.cash_counts for update to authenticated
  using (public.is_branch_manager(branch_id) or public.is_day_cashier(branch_id, work_date))
  with check (public.is_branch_manager(branch_id) or public.is_day_cashier(branch_id, work_date));
create policy cash_counts_delete on public.cash_counts for delete to authenticated
  using (public.is_branch_manager(branch_id));

-- written only through close_day / reopen_day
create policy day_closings_select on public.day_closings for select to authenticated
  using (public.is_branch_manager(branch_id));

-- =============================================================================
-- Review RPCs. p_kind: 'entry' | 'material' | 'cash'
-- =============================================================================
create or replace function public.review_table(p_kind text) returns text
language sql immutable as $$
  select case p_kind when 'entry' then 'time_entries'
                     when 'material' then 'material_reports'
                     when 'cash' then 'cash_counts' end
$$;

-- Kasacı: approve colleagues' hours / material of the day they are kasacı.
create or replace function public.cashier_approve(p_kind text, p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_kind not in ('entry', 'material') then
    raise exception 'Geçersiz kayıt türü' using errcode = '23514';
  end if;
  perform set_config('pz.review', 'on', true);
  execute format(
    'update public.%I set status = ''cashier_approved''
      where id = any($1) and status = ''pending''
        and user_id <> auth.uid() and public.is_day_cashier(branch_id, work_date)',
    public.review_table(p_kind)) using p_ids;
  get diagnostics n = row_count;
  perform set_config('pz.review', 'off', true);
  return n;
end $$;

-- Yönetici: final approval. Hours/material need the kasacı first, except the
-- kasacı's own (D-47); the cash count comes from the kasacı and goes straight here.
create or replace function public.manager_approve(p_kind text, p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.review_table(p_kind) is null then
    raise exception 'Geçersiz kayıt türü' using errcode = '23514';
  end if;
  perform set_config('pz.review', 'on', true);
  if p_kind = 'cash' then
    update public.cash_counts set status = 'approved'
     where id = any(p_ids) and status = 'pending' and public.is_branch_manager(branch_id);
  else
    execute format(
      'update public.%I set status = ''approved''
        where id = any($1) and public.is_branch_manager(branch_id)
          and (status = ''cashier_approved''
               or (status = ''pending'' and public.user_is_day_cashier(branch_id, work_date, user_id)))',
      public.review_table(p_kind)) using p_ids;
  end if;
  get diagnostics n = row_count;
  perform set_config('pz.review', 'off', true);
  return n;
end $$;

-- the old Onay RPC now follows the two-step rule
create or replace function public.approve_entries(p_ids uuid[]) returns integer
language sql security definer set search_path = public as $$
  select public.manager_approve('entry', p_ids)
$$;

-- Kasacı or yönetici: send a record back to its owner with a note.
create or replace function public.return_item(p_kind text, p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_table text := public.review_table(p_kind);
  v_note text := nullif(trim(p_note), '');
  v_branch uuid;
  v_date date;
  v_owner uuid;
  v_status text;
begin
  if v_table is null then
    raise exception 'Geçersiz kayıt türü' using errcode = '23514';
  end if;
  if v_note is null or char_length(v_note) > 300 then
    raise exception 'Geri gönderme sebebini yaz (en fazla 300 karakter)' using errcode = '23514';
  end if;
  execute format('select branch_id, work_date, user_id, status::text from public.%I where id = $1', v_table)
    into v_branch, v_date, v_owner, v_status using p_id;
  if v_branch is null then
    raise exception 'Kayıt bulunamadı' using errcode = 'P0002';
  end if;
  if not (
    (public.is_branch_manager(v_branch) and v_status in ('pending', 'cashier_approved', 'approved'))
    or (p_kind <> 'cash' and v_status = 'pending' and v_owner is distinct from auth.uid()
        and public.is_day_cashier(v_branch, v_date))
  ) then
    raise exception 'Bu kaydı geri gönderemezsin' using errcode = '42501';
  end if;
  perform set_config('pz.review', 'on', true);
  execute format('update public.%I set status = ''returned'', return_note = $2 where id = $1', v_table)
    using p_id, v_note;
  perform set_config('pz.review', 'off', true);
end $$;

-- =============================================================================
-- Earnings views: "pending" = everything finished but not yet green
-- =============================================================================
create or replace view public.entry_earnings with (security_invoker = true) as
select
  e.id, e.user_id, e.branch_id, e.work_date, e.start_at, e.end_at, e.rounded_minutes,
  e.status, e.edited_by_employee, e.edited_by_manager, e.approved_by, e.approved_at,
  r.hourly_rate,
  case when e.rounded_minutes is null or r.hourly_rate is null then null
       else round(e.rounded_minutes / 60.0 * r.hourly_rate, 2) end as amount,
  e.manual,
  e.cashier_approved_by, e.cashier_approved_at, e.returned_at, e.return_note
from public.time_entries e
left join lateral (
  select w.hourly_rate from public.wage_rates w
  where w.user_id = e.user_id
  order by (w.effective_from <= e.work_date) desc,
           case when w.effective_from <= e.work_date then w.effective_from end desc nulls last,
           w.effective_from asc
  limit 1
) r on true;

create or replace view public.monthly_earnings with (security_invoker = true) as
select
  user_id, branch_id, date_trunc('month', work_date)::date as month,
  count(distinct work_date) filter (where status = 'approved')                     as approved_days,
  coalesce(sum(rounded_minutes) filter (where status = 'approved'), 0)::int        as approved_minutes,
  coalesce(sum(rounded_minutes) filter (where status in ('pending', 'cashier_approved', 'returned')), 0)::int
                                                                                   as pending_minutes,
  coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric(10,2)       as approved_amount,
  coalesce(sum(amount) filter (where status in ('pending', 'cashier_approved', 'returned')), 0)::numeric(10,2)
                                                                                   as pending_amount
from public.entry_earnings
group by user_id, branch_id, date_trunc('month', work_date)::date;

create or replace view public.daily_branch_cost with (security_invoker = true) as
select
  branch_id, work_date,
  count(distinct user_id)                                                          as people,
  coalesce(sum(rounded_minutes), 0)::int                                           as minutes,
  coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric(10,2)       as approved_amount,
  coalesce(sum(amount) filter (where status in ('pending', 'cashier_approved', 'returned')), 0)::numeric(10,2)
                                                                                   as pending_amount,
  count(*) filter (where status = 'open')                                          as open_entries,
  count(*) filter (where status in ('pending', 'cashier_approved', 'returned'))    as pending_entries
from public.entry_earnings
group by branch_id, work_date;

-- =============================================================================
-- Close / reopen a day (D-49)
-- =============================================================================
create or replace function public.close_day(p_branch uuid, p_date date) returns public.day_closings
language plpgsql security definer set search_path = public as $$
declare
  v_snapshot jsonb;
  r public.day_closings;
begin
  if not public.is_branch_manager(p_branch) then
    raise exception 'Bu işlem için yetkin yok' using errcode = '42501';
  end if;
  if exists (select 1 from public.time_entries
             where branch_id = p_branch and work_date = p_date and status <> 'approved') then
    raise exception 'Onaylanmamış mesai kaydı var' using errcode = '23514';
  end if;
  if exists (select 1 from public.material_reports
             where branch_id = p_branch and work_date = p_date and status <> 'approved') then
    raise exception 'Onaylanmamış malzeme raporu var' using errcode = '23514';
  end if;
  if not exists (select 1 from public.cash_counts
                 where branch_id = p_branch and work_date = p_date and status = 'approved') then
    raise exception 'Kasa sayımı girilmedi veya onaylanmadı' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', p.full_name, 'start_at', e.start_at, 'end_at', e.end_at,
               'minutes', e.rounded_minutes, 'amount', e.amount,
               'cashier', (select full_name from public.profiles where id = e.cashier_approved_by),
               'approved_by', (select full_name from public.profiles where id = e.approved_by))
             order by e.start_at)
      from public.entry_earnings e join public.profiles p on p.id = e.user_id
      where e.branch_id = p_branch and e.work_date = p_date), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', p.full_name, 'dough_s', m.dough_s, 'dough_m', m.dough_m, 'dough_l', m.dough_l,
               'note', m.note,
               'cashier', (select full_name from public.profiles where id = m.cashier_approved_by),
               'approved_by', (select full_name from public.profiles where id = m.approved_by))
             order by p.full_name)
      from public.material_reports m join public.profiles p on p.id = m.user_id
      where m.branch_id = p_branch and m.work_date = p_date), '[]'::jsonb),
    'cash', (
      select jsonb_build_object(
               'cashier', (select full_name from public.profiles where id = c.user_id),
               'opening_float', c.opening_float, 'online', c.online, 'kiosk', c.kiosk,
               'contant', c.contant, 'total', c.total, 'note', c.note,
               'approved_by', (select full_name from public.profiles where id = c.approved_by))
      from public.cash_counts c where c.branch_id = p_branch and c.work_date = p_date))
  into v_snapshot;

  insert into public.day_closings (branch_id, work_date, closed, closed_by, closed_at, snapshot)
  values (p_branch, p_date, true, auth.uid(), now(), v_snapshot)
  on conflict (branch_id, work_date) do update
    set closed = true, closed_by = excluded.closed_by, closed_at = excluded.closed_at,
        snapshot = excluded.snapshot
  returning * into r;
  return r;
end $$;

create or replace function public.reopen_day(p_branch uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_branch_manager(p_branch) then
    raise exception 'Bu işlem için yetkin yok' using errcode = '42501';
  end if;
  update public.day_closings
     set closed = false, reopened_by = auth.uid(), reopened_at = now()
   where branch_id = p_branch and work_date = p_date and closed;
  if not found then
    raise exception 'Bu gün kapatılmamış' using errcode = 'P0002';
  end if;
end $$;

-- =============================================================================
-- Grants
-- =============================================================================
revoke all on public.material_reports, public.cash_counts, public.day_closings from anon;
grant select, insert, update, delete on public.material_reports, public.cash_counts to authenticated;
grant select on public.day_closings to authenticated;

revoke execute on function
  public.time_entries_before_write(), public.time_entries_after_write(),
  public.day_lock_before_delete(), public.material_reports_before_write(),
  public.cash_counts_before_write(), public.profiles_before_update(), public.shifts_before_write()
from public, anon, authenticated;

revoke execute on function
  public.business_today(uuid), public.has_duty(public.staff_duty),
  public.user_is_day_cashier(uuid, date, uuid), public.is_day_cashier(uuid, date),
  public.in_review(), public.is_day_closed(uuid, date), public.review_table(text),
  public.set_day_cashier(uuid, date, uuid), public.cashier_approve(text, uuid[]),
  public.manager_approve(text, uuid[]), public.approve_entries(uuid[]),
  public.return_item(text, uuid, text), public.close_day(uuid, date), public.reopen_day(uuid, date)
from public, anon;

grant execute on function
  public.business_today(uuid), public.has_duty(public.staff_duty),
  public.user_is_day_cashier(uuid, date, uuid), public.is_day_cashier(uuid, date),
  public.in_review(), public.is_day_closed(uuid, date), public.review_table(text),
  public.set_day_cashier(uuid, date, uuid), public.cashier_approve(text, uuid[]),
  public.manager_approve(text, uuid[]), public.approve_entries(uuid[]),
  public.return_item(text, uuid, text), public.close_day(uuid, date), public.reopen_day(uuid, date)
to authenticated;
