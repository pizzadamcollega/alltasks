-- =============================================================================
-- Pizzadam Şube ERP — initial schema
-- Tables, enums, helper functions, triggers, RLS policies, views and RPCs.
-- Target: Supabase Postgres (15+). Time zone for all business logic: Europe/Amsterdam.
-- pg_cron scheduling lives in a separate migration (…_cron.sql).
-- =============================================================================

set check_function_bodies = off;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role       as enum ('admin', 'patron', 'employee');
create type public.entry_status   as enum ('open', 'pending', 'approved');
create type public.week_status    as enum ('collecting', 'draft', 'locked');
create type public.request_kind   as enum ('template_ok', 'change');
create type public.decision_status as enum ('pending', 'approved', 'rejected');
create type public.leave_kind     as enum ('izin', 'tatil');
create type public.payment_kind   as enum ('payment', 'advance');
create type public.swap_status    as enum ('pending', 'accepted', 'declined', 'cancelled', 'reverted');
create type public.theme_pref     as enum ('system', 'light', 'dark');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.branches (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                      text not null,
  address                   text,
  -- ISO weekday (1 = Monday … 7 = Sunday) of the week BEFORE the schedule week
  request_deadline_weekday  smallint not null default 4 check (request_deadline_weekday between 1 and 7),
  request_deadline_time     time not null default '23:59',
  -- A shift that starts before this local time belongs to the previous business day
  day_cutoff                time not null default '06:00',
  created_at                timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 80),
  username    text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  role        public.app_role not null default 'employee',
  theme       public.theme_pref not null default 'system',
  active      boolean not null default true,
  started_on  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.branch_members (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, branch_id)
);
create index branch_members_branch_idx on public.branch_members (branch_id);

create table public.wage_rates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  hourly_rate     numeric(6,2) not null check (hourly_rate > 0 and hourly_rate < 1000),
  effective_from  date not null,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  unique (user_id, effective_from)
);

create table public.time_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  branch_id           uuid not null references public.branches (id) on delete restrict,
  work_date           date not null,              -- set by trigger (business day)
  start_at            timestamptz not null default now(),
  end_at              timestamptz,
  rounded_minutes     integer,                    -- set by trigger (nearest 5 minutes)
  status              public.entry_status not null default 'open',
  edited_by_employee  boolean not null default false,
  edited_by_manager   boolean not null default false,
  approved_by         uuid references public.profiles (id),
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint time_entries_end_after_start check (end_at is null or end_at > start_at),
  constraint time_entries_max_16h check (end_at is null or end_at - start_at <= interval '16 hours'),
  constraint time_entries_end_required check (status = 'open' or end_at is not null)
);
create unique index time_entries_one_open_per_user on public.time_entries (user_id) where status = 'open';
create index time_entries_branch_date_idx on public.time_entries (branch_id, work_date);
create index time_entries_user_date_idx on public.time_entries (user_id, work_date);

create table public.time_entry_audit (
  id          bigint generated always as identity primary key,
  entry_id    uuid not null references public.time_entries (id) on delete cascade,
  action      text not null check (action in ('clock_in', 'clock_out', 'manual_create', 'edit', 'approve', 'unapprove')),
  changed_by  uuid references public.profiles (id),
  changed_at  timestamptz not null default now(),
  old_start   timestamptz,
  old_end     timestamptz,
  new_start   timestamptz,
  new_end     timestamptz,
  old_status  public.entry_status,
  new_status  public.entry_status
);
create index time_entry_audit_entry_idx on public.time_entry_audit (entry_id, changed_at);

create table public.min_staff_rules (
  branch_id  uuid not null references public.branches (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  min_count  smallint not null default 0 check (min_count between 0 and 50),
  primary key (branch_id, weekday)
);

create table public.schedule_weeks (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.branches (id) on delete cascade,
  week_start    date not null check (extract(isodow from week_start) = 1),
  status        public.week_status not null default 'collecting',
  deadline_at   timestamptz not null,
  drafted_at    timestamptz,
  published_at  timestamptz,
  published_by  uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  unique (branch_id, week_start)
);

create table public.schedule_requests (
  id            uuid primary key default gen_random_uuid(),
  week_id       uuid not null references public.schedule_weeks (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          public.request_kind not null,
  days          date[] not null default '{}',
  note          text check (length(note) <= 500),
  auto          boolean not null default false,  -- true = created at deadline for a non-responder
  submitted_at  timestamptz not null default now(),
  unique (week_id, user_id)
);

create table public.schedule_assignments (
  week_id     uuid not null references public.schedule_weeks (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete cascade,  -- denormalised by trigger
  user_id     uuid not null references public.profiles (id) on delete cascade,
  work_date   date not null,
  source      text not null default 'manager' check (source in ('template', 'request', 'manager', 'swap')),
  created_at  timestamptz not null default now(),
  primary key (week_id, user_id, work_date)
);
create index schedule_assignments_branch_date_idx on public.schedule_assignments (branch_id, work_date);

create table public.schedule_swaps (
  id                   uuid primary key default gen_random_uuid(),
  week_id              uuid not null references public.schedule_weeks (id) on delete cascade,
  branch_id            uuid not null references public.branches (id) on delete cascade,
  work_date            date not null,             -- the day from_user gives away
  swap_date            date,                      -- optional: the day from_user takes from to_user (null = give away only)
  from_user            uuid not null references public.profiles (id) on delete cascade,
  to_user              uuid not null references public.profiles (id) on delete cascade,
  status               public.swap_status not null default 'pending',
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  seen_by_manager_at   timestamptz,
  reverted_by          uuid references public.profiles (id),
  check (from_user <> to_user)
);
create index schedule_swaps_branch_idx on public.schedule_swaps (branch_id, status);

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           public.leave_kind not null,
  start_date     date not null,
  end_date       date not null,
  note           text check (length(note) <= 500),
  status         public.decision_status not null default 'pending',
  decided_by     uuid references public.profiles (id),
  decided_at     timestamptz,
  decision_note  text check (length(decision_note) <= 500),
  created_at     timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 60)
);
create index leave_requests_user_idx on public.leave_requests (user_id, start_date);

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  branch_id            uuid not null references public.branches (id) on delete cascade,
  month                date not null check (extract(day from month) = 1),
  kind                 public.payment_kind not null,
  amount               numeric(8,2) not null check (amount > 0),
  paid_on              date not null default current_date,
  note                 text check (length(note) <= 300),
  visible_to_employee  boolean not null default false,
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now()
);
create index payments_user_month_idx on public.payments (user_id, month);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  branch_id   uuid references public.branches (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can call them without recursion)
-- -----------------------------------------------------------------------------
create or replace function public.app_tz() returns text
language sql immutable as $$ select 'Europe/Amsterdam'::text $$;

create or replace function public.local_today() returns date
language sql stable as $$ select (now() at time zone public.app_tz())::date $$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_branch_member(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (
        select 1 from public.branch_members bm
        join public.profiles p on p.id = bm.user_id
        where bm.user_id = auth.uid() and bm.branch_id = p_branch and p.active
      )
$$;

create or replace function public.is_branch_manager(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.my_role() = 'patron'
          and exists (select 1 from public.branch_members
                      where user_id = auth.uid() and branch_id = p_branch))
$$;

-- Caller may manage this user's account, wage and payments:
-- admin → anyone except other admins; patron → employees of their branch.
create or replace function public.manages_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then
      coalesce((select role <> 'admin' or id = auth.uid() from public.profiles where id = p_user), false)
    when public.my_role() = 'patron' then exists (
      select 1
      from public.branch_members mine
      join public.branch_members theirs on theirs.branch_id = mine.branch_id
      join public.profiles t on t.id = theirs.user_id
      where mine.user_id = auth.uid() and theirs.user_id = p_user and t.role = 'employee')
    else false
  end
$$;

-- Caller and p_user share at least one branch (used to show colleagues' names)
create or replace function public.shares_branch(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.branch_members a
    join public.branch_members b on b.branch_id = a.branch_id
    where a.user_id = auth.uid() and b.user_id = p_user)
$$;

create or replace function public.week_branch(p_week uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from public.schedule_weeks where id = p_week
$$;

create or replace function public.compute_work_date(p_start timestamptz, p_branch uuid) returns date
language sql stable set search_path = public as $$
  select case
    when (p_start at time zone public.app_tz())::time < coalesce(b.day_cutoff, '06:00'::time)
      then (p_start at time zone public.app_tz())::date - 1
    else (p_start at time zone public.app_tz())::date
  end
  from public.branches b where b.id = p_branch
$$;

create or replace function public.round_minutes(p_start timestamptz, p_end timestamptz) returns integer
language sql immutable as $$
  select case when p_end is null then null
              else (round(extract(epoch from (p_end - p_start)) / 300.0) * 5)::integer end
$$;

create or replace function public.week_deadline(p_branch uuid, p_week_start date) returns timestamptz
language sql stable set search_path = public as $$
  select ((p_week_start - 7 + (b.request_deadline_weekday - 1))::date + b.request_deadline_time)
         at time zone public.app_tz()
  from public.branches b where b.id = p_branch
$$;

create or replace function public.branch_slug(p_branch uuid) returns text
language sql stable security definer set search_path = public as $$
  select slug from public.branches where id = p_branch
$$;

-- Notifications (internal)
create or replace function public.notify(
  p_user uuid, p_branch uuid, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_data jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, branch_id, kind, title, body, link, data)
  values (p_user, p_branch, p_kind, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb))
$$;

create or replace function public.notify_branch_managers(
  p_branch uuid, p_kind text, p_title text, p_body text default null,
  p_link text default null, p_data jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, branch_id, kind, title, body, link, data)
  select p.id, p_branch, p_kind, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb)
  from public.profiles p
  where p.active and (
    p.role = 'admin'
    or (p.role = 'patron' and exists (select 1 from public.branch_members bm
                                      where bm.user_id = p.id and bm.branch_id = p_branch)))
$$;

-- -----------------------------------------------------------------------------
-- Triggers: profiles & memberships
-- -----------------------------------------------------------------------------
create or replace function public.profiles_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  new.updated_at := now();
  if v_uid is null then return new; end if;           -- service role / server
  if new.username is distinct from old.username then
    raise exception 'Kullanıcı adı sadece sunucu tarafında değiştirilebilir' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Rol değişikliği sadece admin tarafından yapılabilir' using errcode = '42501';
  end if;
  if old.id = v_uid and not public.is_admin() then
    -- self-service: only the theme
    if (new.full_name, new.active, new.started_on) is distinct from (old.full_name, old.active, old.started_on) then
      raise exception 'Sadece tema tercihini değiştirebilirsin' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profiles_before_update();

create or replace function public.branch_members_check_patron() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select role from public.profiles where id = new.user_id) = 'patron'
     and exists (select 1 from public.branch_members
                 where user_id = new.user_id and branch_id <> new.branch_id) then
    raise exception 'Bir patron sadece bir şubeye bağlı olabilir' using errcode = '23514';
  end if;
  if auth.uid() is not null and not public.is_admin()
     and (select role from public.profiles where id = new.user_id) <> 'employee' then
    raise exception 'Patron sadece çalışan ekleyebilir' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger branch_members_check_patron before insert or update on public.branch_members
  for each row execute function public.branch_members_check_patron();

-- -----------------------------------------------------------------------------
-- Triggers: time entries
-- -----------------------------------------------------------------------------
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
        -- clock-in: server time, open entry, no flags
        new.start_at := now();
        new.end_at := null;
        new.status := 'open';
        new.edited_by_employee := false;
        new.edited_by_manager := false;
        new.approved_by := null;
        new.approved_at := null;
      else
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
create trigger time_entries_before_write before insert or update on public.time_entries
  for each row execute function public.time_entries_before_write();

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
    else 'unapprove' end;

  insert into public.time_entry_audit
    (entry_id, action, changed_by, old_start, old_end, new_start, new_end, old_status, new_status)
  values (new.id, v_action, v_uid, old.start_at, old.end_at, new.start_at, new.end_at, old.status, new.status);

  if v_uid is not null and v_uid <> new.user_id and v_times_changed then
    perform public.notify(
      new.user_id, new.branch_id, 'entry_edited_by_manager', 'Mesai kaydın düzenlendi',
      format('%s tarihli kaydın patron tarafından güncellendi: %s – %s',
             to_char(new.work_date, 'DD.MM.YYYY'),
             to_char(new.start_at at time zone public.app_tz(), 'HH24:MI'),
             to_char(new.end_at at time zone public.app_tz(), 'HH24:MI')),
      '/' || public.branch_slug(new.branch_id) || '/gecmis',
      jsonb_build_object('entry_id', new.id));
  end if;
  return null;
end $$;
create trigger time_entries_after_write after insert or update on public.time_entries
  for each row execute function public.time_entries_after_write();

-- -----------------------------------------------------------------------------
-- Triggers: schedule
-- -----------------------------------------------------------------------------
create or replace function public.schedule_weeks_before_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.deadline_at is null then
    new.deadline_at := public.week_deadline(new.branch_id, new.week_start);
  end if;
  return new;
end $$;
create trigger schedule_weeks_before_insert before insert on public.schedule_weeks
  for each row execute function public.schedule_weeks_before_insert();

-- Keep deadlines of still-collecting weeks in sync with branch settings
create or replace function public.branches_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.request_deadline_weekday, new.request_deadline_time)
     is distinct from (old.request_deadline_weekday, old.request_deadline_time) then
    update public.schedule_weeks
       set deadline_at = public.week_deadline(new.id, week_start)
     where branch_id = new.id and status = 'collecting';
  end if;
  return null;
end $$;
create trigger branches_after_update after update on public.branches
  for each row execute function public.branches_after_update();

create or replace function public.schedule_requests_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare w public.schedule_weeks;
begin
  select * into w from public.schedule_weeks where id = new.week_id;
  new.days := array(select distinct d from unnest(new.days) d order by d);
  if exists (select 1 from unnest(new.days) d where d < w.week_start or d > w.week_start + 6) then
    raise exception 'Seçilen günler bu haftanın dışında' using errcode = '23514';
  end if;
  if auth.uid() is not null and not public.is_branch_manager(w.branch_id) then
    if new.user_id <> auth.uid() then
      raise exception 'Başkası adına talep gönderemezsin' using errcode = '42501';
    end if;
    if w.status <> 'collecting' or now() >= w.deadline_at then
      raise exception 'Bu hafta için talepler kapandı' using errcode = '23514';
    end if;
    if exists (
      select 1 from unnest(new.days) d
      join public.leave_requests l on l.user_id = new.user_id and l.status = 'approved'
       and d between l.start_date and l.end_date) then
      raise exception 'Onaylı izin günlerini seçemezsin' using errcode = '23514';
    end if;
    new.auto := false;
  end if;
  new.submitted_at := now();
  return new;
end $$;
create trigger schedule_requests_before_write before insert or update on public.schedule_requests
  for each row execute function public.schedule_requests_before_write();

create or replace function public.schedule_assignments_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare w public.schedule_weeks;
begin
  select * into w from public.schedule_weeks where id = new.week_id;
  new.branch_id := w.branch_id;
  if new.work_date < w.week_start or new.work_date > w.week_start + 6 then
    raise exception 'Gün bu haftanın dışında' using errcode = '23514';
  end if;
  if not exists (select 1 from public.branch_members where user_id = new.user_id and branch_id = w.branch_id) then
    raise exception 'Bu kişi bu şubenin çalışanı değil' using errcode = '23514';
  end if;
  if auth.uid() is not null and coalesce(current_setting('app.in_swap', true), '') <> 'on' then
    new.source := 'manager';
  end if;
  return new;
end $$;
create trigger schedule_assignments_before_write before insert or update on public.schedule_assignments
  for each row execute function public.schedule_assignments_before_write();

-- A manager changing a LOCKED week notifies the affected employee
create or replace function public.schedule_assignments_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  w public.schedule_weeks;
begin
  r := coalesce(new, old);
  if auth.uid() is null or coalesce(current_setting('app.in_swap', true), '') = 'on' then
    return null;
  end if;
  select * into w from public.schedule_weeks where id = r.week_id;
  if w.status = 'locked' then
    perform public.notify(
      r.user_id, w.branch_id, 'program_changed',
      case when tg_op = 'DELETE' then 'Programından bir gün çıkarıldı' else 'Programına bir gün eklendi' end,
      format('%s (%s)', to_char(r.work_date, 'DD.MM.YYYY'), public.branch_slug(w.branch_id)),
      '/' || public.branch_slug(w.branch_id) || '/takvim',
      jsonb_build_object('week_id', w.id, 'date', r.work_date));
  end if;
  return null;
end $$;
create trigger schedule_assignments_after_write after insert or delete on public.schedule_assignments
  for each row execute function public.schedule_assignments_after_write();

-- -----------------------------------------------------------------------------
-- Triggers: leave requests & payments
-- -----------------------------------------------------------------------------
create or replace function public.leave_requests_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() and not public.manages_user(new.user_id) then
      raise exception 'Başkası adına izin talebi açamazsın' using errcode = '42501';
    end if;
    if not public.manages_user(new.user_id) then
      new.status := 'pending';
      new.decided_by := null; new.decided_at := null; new.decision_note := null;
      if new.start_date < public.local_today() then
        raise exception 'Geçmiş bir tarih için izin istenemez' using errcode = '23514';
      end if;
    end if;
  else
    if not public.manages_user(old.user_id) then
      raise exception 'İzin kararını sadece patron verebilir' using errcode = '42501';
    end if;
    if (new.user_id, new.kind, new.start_date, new.end_date, new.note)
       is distinct from (old.user_id, old.kind, old.start_date, old.end_date, old.note) then
      raise exception 'Talebin içeriği değiştirilemez' using errcode = '42501';
    end if;
  end if;
  if new.status <> 'pending' and (tg_op = 'INSERT' or old.status = 'pending') then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end $$;
create trigger leave_requests_before_write before insert or update on public.leave_requests
  for each row execute function public.leave_requests_before_write();

create or replace function public.leave_requests_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    for b in select branch_id from public.branch_members where user_id = new.user_id loop
      perform public.notify_branch_managers(
        b.branch_id, 'leave_requested', 'Yeni izin talebi',
        format('%s: %s – %s (%s)', (select full_name from public.profiles where id = new.user_id),
               to_char(new.start_date, 'DD.MM'), to_char(new.end_date, 'DD.MM'), new.kind),
        '/' || public.branch_slug(b.branch_id) || '/talepler',
        jsonb_build_object('leave_id', new.id));
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status and new.status <> 'pending' then
    perform public.notify(
      new.user_id, null, 'leave_decided',
      case when new.status = 'approved' then 'İzin talebin onaylandı' else 'İzin talebin reddedildi' end,
      format('%s – %s%s', to_char(new.start_date, 'DD.MM.YYYY'), to_char(new.end_date, 'DD.MM.YYYY'),
             coalesce(' · ' || new.decision_note, '')),
      null, jsonb_build_object('leave_id', new.id));
    -- approved leave overlapping an already locked schedule → tell the managers
    if new.status = 'approved' then
      for b in
        select distinct a.branch_id from public.schedule_assignments a
        join public.schedule_weeks w on w.id = a.week_id and w.status = 'locked'
        where a.user_id = new.user_id and a.work_date between new.start_date and new.end_date
      loop
        perform public.notify_branch_managers(
          b.branch_id, 'leave_conflict', 'Onaylı izin programla çakışıyor',
          format('%s programda olduğu bir günde izinli. Programı düzenle.',
                 (select full_name from public.profiles where id = new.user_id)),
          '/' || public.branch_slug(b.branch_id) || '/program',
          jsonb_build_object('leave_id', new.id));
      end loop;
    end if;
  end if;
  return null;
end $$;
create trigger leave_requests_after_write after insert or update on public.leave_requests
  for each row execute function public.leave_requests_after_write();

create or replace function public.payments_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  new.month := date_trunc('month', new.month)::date;
  return new;
end $$;
create trigger payments_before_write before insert or update on public.payments
  for each row execute function public.payments_before_write();

create or replace function public.payments_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visible_to_employee and (tg_op = 'INSERT' or not old.visible_to_employee) then
    perform public.notify(
      new.user_id, new.branch_id, 'payment_recorded',
      case when new.kind = 'advance' then 'Avans kaydedildi' else 'Ödeme kaydedildi' end,
      format('€%s · %s', to_char(new.amount, 'FM999G990D00'), to_char(new.paid_on, 'DD.MM.YYYY')),
      '/' || public.branch_slug(new.branch_id) || '/gecmis',
      jsonb_build_object('payment_id', new.id));
  end if;
  return null;
end $$;
create trigger payments_after_write after insert or update on public.payments
  for each row execute function public.payments_after_write();

-- -----------------------------------------------------------------------------
-- Views (security_invoker → caller's RLS applies to every underlying table)
-- -----------------------------------------------------------------------------
create or replace view public.entry_earnings with (security_invoker = true) as
select
  e.id, e.user_id, e.branch_id, e.work_date, e.start_at, e.end_at, e.rounded_minutes,
  e.status, e.edited_by_employee, e.edited_by_manager, e.approved_by, e.approved_at,
  r.hourly_rate,
  case when e.rounded_minutes is null or r.hourly_rate is null then null
       else round(e.rounded_minutes / 60.0 * r.hourly_rate, 2) end as amount
from public.time_entries e
left join lateral (
  select w.hourly_rate from public.wage_rates w
  where w.user_id = e.user_id and w.effective_from <= e.work_date
  order by w.effective_from desc limit 1
) r on true;

create or replace view public.monthly_earnings with (security_invoker = true) as
select
  user_id, branch_id, date_trunc('month', work_date)::date as month,
  count(distinct work_date) filter (where status = 'approved')                     as approved_days,
  coalesce(sum(rounded_minutes) filter (where status = 'approved'), 0)::int        as approved_minutes,
  coalesce(sum(rounded_minutes) filter (where status = 'pending'), 0)::int         as pending_minutes,
  coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric(10,2)       as approved_amount,
  coalesce(sum(amount) filter (where status = 'pending'), 0)::numeric(10,2)        as pending_amount
from public.entry_earnings
group by user_id, branch_id, date_trunc('month', work_date)::date;

create or replace view public.daily_branch_cost with (security_invoker = true) as
select
  branch_id, work_date,
  count(distinct user_id)                                                          as people,
  coalesce(sum(rounded_minutes), 0)::int                                           as minutes,
  coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric(10,2)       as approved_amount,
  coalesce(sum(amount) filter (where status = 'pending'), 0)::numeric(10,2)        as pending_amount,
  count(*) filter (where status = 'open')                                          as open_entries,
  count(*) filter (where status = 'pending')                                       as pending_entries
from public.entry_earnings
group by branch_id, work_date;

-- -----------------------------------------------------------------------------
-- Schedule engine (internal, run by cron or by a manager through RPCs below)
-- -----------------------------------------------------------------------------

-- The user's template for a week = their days in the most recent LOCKED week of
-- the same branch, shifted to this week (same weekdays).
create or replace function public.template_days_internal(p_week uuid, p_user uuid) returns date[]
language sql stable security definer set search_path = public as $$
  with w as (select * from public.schedule_weeks where id = p_week),
       prev as (
         select pw.* from public.schedule_weeks pw, w
         where pw.branch_id = w.branch_id and pw.status = 'locked' and pw.week_start < w.week_start
         order by pw.week_start desc limit 1)
  select coalesce(array_agg(w.week_start + (a.work_date - prev.week_start) order by a.work_date), '{}')
  from w, prev
  join public.schedule_assignments a on a.week_id = prev.id and a.user_id = p_user
$$;

create or replace function public.ensure_schedule_weeks() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.local_today();
  v_monday date := v_today - (extract(isodow from v_today)::int - 1);
begin
  insert into public.schedule_weeks (branch_id, week_start, deadline_at)
  select b.id, ws, public.week_deadline(b.id, ws)
  from public.branches b
  cross join (values (v_monday), (v_monday + 7), (v_monday + 14)) as v(ws)
  on conflict (branch_id, week_start) do nothing;
end $$;

create or replace function public.build_week_draft(p_week uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  w public.schedule_weeks;
  m record;
  v_req public.schedule_requests;
  v_days date[];
  v_source text;
  v_short int;
begin
  select * into w from public.schedule_weeks where id = p_week for update;
  if not found or w.status <> 'collecting' then return; end if;

  perform set_config('app.in_swap', 'on', true);   -- keep the computed source, no notifications

  for m in
    select p.id as user_id
    from public.branch_members bm join public.profiles p on p.id = bm.user_id
    where bm.branch_id = w.branch_id and p.active and p.role = 'employee'
  loop
    select * into v_req from public.schedule_requests where week_id = w.id and user_id = m.user_id;
    if found then
      v_days := v_req.days;
      v_source := case when v_req.kind = 'change' then 'request' else 'template' end;
    else
      v_days := public.template_days_internal(w.id, m.user_id);
      v_source := 'template';
      insert into public.schedule_requests (week_id, user_id, kind, days, auto)
      values (w.id, m.user_id, 'template_ok', v_days, true)
      on conflict (week_id, user_id) do nothing;
    end if;

    insert into public.schedule_assignments (week_id, branch_id, user_id, work_date, source)
    select w.id, w.branch_id, m.user_id, d, v_source
    from unnest(v_days) d
    where not exists (
      select 1 from public.leave_requests l
      where l.user_id = m.user_id and l.status = 'approved' and d between l.start_date and l.end_date)
    on conflict do nothing;
  end loop;

  perform set_config('app.in_swap', '', true);

  update public.schedule_weeks set status = 'draft', drafted_at = now() where id = w.id;

  select count(*) into v_short
  from generate_series(w.week_start, w.week_start + 6, interval '1 day') g(d)
  join public.min_staff_rules r on r.branch_id = w.branch_id and r.weekday = extract(isodow from g.d)
  where (select count(*) from public.schedule_assignments a
         where a.week_id = w.id and a.work_date = g.d::date) < r.min_count;

  perform public.notify_branch_managers(
    w.branch_id, 'week_draft_ready', 'Program taslağı hazır',
    format('%s – %s haftası onayını bekliyor%s',
           to_char(w.week_start, 'DD.MM'), to_char(w.week_start + 6, 'DD.MM'),
           case when v_short > 0 then format(' · %s gün minimumun altında', v_short) else '' end),
    '/' || public.branch_slug(w.branch_id) || '/program',
    jsonb_build_object('week_id', w.id, 'short_days', v_short));
end $$;

create or replace function public.close_due_weeks() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.schedule_weeks
           where status = 'collecting' and deadline_at <= now()
           order by week_start
  loop
    perform public.build_week_draft(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.run_schedule_jobs() returns integer
language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_schedule_weeks();
  return public.close_due_weeks();
end $$;

-- -----------------------------------------------------------------------------
-- RPCs callable by signed-in users (PostgREST: supabase.rpc('…'))
-- -----------------------------------------------------------------------------

-- Employee: start a shift in a branch they belong to
create or replace function public.clock_in(p_branch uuid) returns public.time_entries
language plpgsql security invoker set search_path = public as $$
declare e public.time_entries;
begin
  if not public.is_branch_member(p_branch) then
    raise exception 'Bu şubede kaydın yok' using errcode = '42501';
  end if;
  if exists (select 1 from public.time_entries where user_id = auth.uid() and status = 'open') then
    raise exception 'Zaten açık bir mesain var' using errcode = '23505';
  end if;
  insert into public.time_entries (user_id, branch_id) values (auth.uid(), p_branch) returning * into e;
  return e;
end $$;

-- Employee: end the open shift
create or replace function public.clock_out() returns public.time_entries
language plpgsql security invoker set search_path = public as $$
declare e public.time_entries;
begin
  update public.time_entries set end_at = now()
   where user_id = auth.uid() and status = 'open'
  returning * into e;
  if e.id is null then
    raise exception 'Açık mesai bulunamadı' using errcode = 'P0002';
  end if;
  return e;
end $$;

-- Manager: approve many entries at once (skips open ones)
create or replace function public.approve_entries(p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.time_entries set status = 'approved'
   where id = any(p_ids) and status = 'pending' and public.is_branch_manager(branch_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Employee or manager: the template days for a user in a week
create or replace function public.template_days(p_week uuid, p_user uuid default auth.uid()) returns date[]
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user <> auth.uid() and not public.is_branch_manager(public.week_branch(p_week)) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  if not public.is_branch_member(public.week_branch(p_week)) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  return public.template_days_internal(p_week, p_user);
end $$;

-- Manager: close requests now and build the draft (before the deadline)
create or replace function public.close_week_now(p_week uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_branch_manager(public.week_branch(p_week)) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  perform public.build_week_draft(p_week);
end $$;

-- Manager: publish & lock a draft week; tell each employee what they got
create or replace function public.publish_week(p_week uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  w public.schedule_weeks;
  m record;
  v_assigned date[];
  v_requested date[];
  v_auto boolean;
  v_changed boolean;
begin
  select * into w from public.schedule_weeks where id = p_week for update;
  if not found or not public.is_branch_manager(w.branch_id) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  if w.status = 'collecting' then
    perform public.build_week_draft(p_week);
  elsif w.status = 'locked' then
    raise exception 'Bu hafta zaten yayınlandı' using errcode = '23514';
  end if;

  update public.schedule_weeks
     set status = 'locked', published_at = now(), published_by = auth.uid()
   where id = p_week;

  for m in
    select p.id as user_id from public.branch_members bm join public.profiles p on p.id = bm.user_id
    where bm.branch_id = w.branch_id and p.active and p.role = 'employee'
  loop
    select coalesce(array_agg(work_date order by work_date), '{}') into v_assigned
      from public.schedule_assignments where week_id = p_week and user_id = m.user_id;
    v_requested := null; v_auto := true;
    select days, auto into v_requested, v_auto
      from public.schedule_requests where week_id = p_week and user_id = m.user_id;
    -- "changed" only when the employee actively asked for something else
    v_changed := not coalesce(v_auto, true) and v_assigned <> coalesce(v_requested, '{}');
    perform public.notify(
      m.user_id, w.branch_id,
      case when v_changed then 'program_changed' else 'program_published' end,
      case when v_changed then 'Programın patron tarafından düzenlendi' else 'Haftalık program yayınlandı' end,
      format('%s – %s · %s gün', to_char(w.week_start, 'DD.MM'), to_char(w.week_start + 6, 'DD.MM'),
             coalesce(array_length(v_assigned, 1), 0)),
      '/' || public.branch_slug(w.branch_id) || '/takvim',
      jsonb_build_object('week_id', w.id));
  end loop;
end $$;

-- Employee: offer one of my days in a locked week to a colleague
-- (p_swap_date given = I take that day of theirs in return)
create or replace function public.request_swap(
  p_week uuid, p_date date, p_to uuid, p_swap_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  w public.schedule_weeks;
  v_id uuid;
begin
  select * into w from public.schedule_weeks where id = p_week;
  if not found or w.status <> 'locked' then
    raise exception 'Gün değişikliği sadece yayınlanmış programda yapılabilir' using errcode = '23514';
  end if;
  if not public.is_branch_member(w.branch_id) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  if p_date < public.local_today() or (p_swap_date is not null and p_swap_date < public.local_today()) then
    raise exception 'Geçmiş bir gün değiştirilemez' using errcode = '23514';
  end if;
  if not exists (select 1 from public.schedule_assignments where week_id = p_week and user_id = auth.uid() and work_date = p_date) then
    raise exception 'Bu gün programında değil' using errcode = '23514';
  end if;
  if not exists (select 1 from public.branch_members bm join public.profiles p on p.id = bm.user_id
                 where bm.branch_id = w.branch_id and bm.user_id = p_to and p.active and p.role = 'employee') then
    raise exception 'Bu kişi bu şubede çalışmıyor' using errcode = '23514';
  end if;
  if exists (select 1 from public.schedule_assignments where week_id = p_week and user_id = p_to and work_date = p_date) then
    raise exception 'Arkadaşın o gün zaten programda' using errcode = '23514';
  end if;
  if p_swap_date is not null then
    if not exists (select 1 from public.schedule_assignments where week_id = p_week and user_id = p_to and work_date = p_swap_date) then
      raise exception 'Arkadaşın karşılık gün programında değil' using errcode = '23514';
    end if;
    if exists (select 1 from public.schedule_assignments where week_id = p_week and user_id = auth.uid() and work_date = p_swap_date) then
      raise exception 'Karşılık gün zaten programında' using errcode = '23514';
    end if;
  end if;
  if exists (select 1 from public.schedule_swaps where week_id = p_week and from_user = auth.uid()
             and work_date = p_date and status = 'pending') then
    raise exception 'Bu gün için bekleyen bir talebin var' using errcode = '23505';
  end if;

  insert into public.schedule_swaps (week_id, branch_id, work_date, swap_date, from_user, to_user)
  values (p_week, w.branch_id, p_date, p_swap_date, auth.uid(), p_to)
  returning id into v_id;

  perform public.notify(
    p_to, w.branch_id, 'swap_requested', 'Gün değişikliği talebi',
    format('%s, %s gününü sana devretmek istiyor%s',
           (select full_name from public.profiles where id = auth.uid()), to_char(p_date, 'DD.MM'),
           case when p_swap_date is not null then format(' (karşılığında %s)', to_char(p_swap_date, 'DD.MM')) else '' end),
    '/' || public.branch_slug(w.branch_id) || '/takvim', jsonb_build_object('swap_id', v_id));
  return v_id;
end $$;

create or replace function public.respond_swap(p_swap uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.schedule_swaps;
  v_from_name text;
  v_to_name text;
begin
  select * into s from public.schedule_swaps where id = p_swap for update;
  if not found or s.to_user <> auth.uid() then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  if s.status <> 'pending' then
    raise exception 'Bu talep artık geçerli değil' using errcode = '23514';
  end if;
  select full_name into v_from_name from public.profiles where id = s.from_user;
  select full_name into v_to_name from public.profiles where id = s.to_user;

  if not p_accept then
    update public.schedule_swaps set status = 'declined', responded_at = now() where id = p_swap;
    perform public.notify(s.from_user, s.branch_id, 'swap_declined', 'Gün değişikliği reddedildi',
      format('%s, %s günü için talebini kabul etmedi', v_to_name, to_char(s.work_date, 'DD.MM')),
      '/' || public.branch_slug(s.branch_id) || '/takvim', jsonb_build_object('swap_id', s.id));
    return;
  end if;

  -- re-validate against the current schedule
  if s.work_date < public.local_today()
     or not exists (select 1 from public.schedule_assignments where week_id = s.week_id and user_id = s.from_user and work_date = s.work_date)
     or exists (select 1 from public.schedule_assignments where week_id = s.week_id and user_id = s.to_user and work_date = s.work_date)
     or (s.swap_date is not null and (
          not exists (select 1 from public.schedule_assignments where week_id = s.week_id and user_id = s.to_user and work_date = s.swap_date)
          or exists (select 1 from public.schedule_assignments where week_id = s.week_id and user_id = s.from_user and work_date = s.swap_date)))
  then
    update public.schedule_swaps set status = 'cancelled', responded_at = now() where id = p_swap;
    raise exception 'Program değiştiği için bu talep artık uygulanamıyor' using errcode = '23514';
  end if;

  perform set_config('app.in_swap', 'on', true);
  delete from public.schedule_assignments where week_id = s.week_id and user_id = s.from_user and work_date = s.work_date;
  insert into public.schedule_assignments (week_id, branch_id, user_id, work_date, source)
  values (s.week_id, s.branch_id, s.to_user, s.work_date, 'swap');
  if s.swap_date is not null then
    delete from public.schedule_assignments where week_id = s.week_id and user_id = s.to_user and work_date = s.swap_date;
    insert into public.schedule_assignments (week_id, branch_id, user_id, work_date, source)
    values (s.week_id, s.branch_id, s.from_user, s.swap_date, 'swap');
  end if;
  perform set_config('app.in_swap', '', true);

  update public.schedule_swaps set status = 'accepted', responded_at = now() where id = p_swap;

  perform public.notify(s.from_user, s.branch_id, 'swap_accepted', 'Gün değişikliği kabul edildi',
    format('%s, %s gününü devraldı', v_to_name, to_char(s.work_date, 'DD.MM')),
    '/' || public.branch_slug(s.branch_id) || '/takvim', jsonb_build_object('swap_id', s.id));
  perform public.notify_branch_managers(s.branch_id, 'swap_done', 'Çalışanlar gün değiştirdi',
    format('%s → %s · %s%s', v_from_name, v_to_name, to_char(s.work_date, 'DD.MM'),
           case when s.swap_date is not null then format(' (karşılığında %s)', to_char(s.swap_date, 'DD.MM')) else '' end),
    '/' || public.branch_slug(s.branch_id) || '/program', jsonb_build_object('swap_id', s.id));
end $$;

create or replace function public.cancel_swap(p_swap uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.schedule_swaps set status = 'cancelled', responded_at = now()
   where id = p_swap and from_user = auth.uid() and status = 'pending';
  if not found then raise exception 'Talep bulunamadı' using errcode = 'P0002'; end if;
end $$;

-- Manager: undo an accepted swap
create or replace function public.revert_swap(p_swap uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.schedule_swaps;
begin
  select * into s from public.schedule_swaps where id = p_swap for update;
  if not found or not public.is_branch_manager(s.branch_id) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  if s.status <> 'accepted' then
    raise exception 'Sadece kabul edilmiş değişiklik geri alınabilir' using errcode = '23514';
  end if;

  perform set_config('app.in_swap', 'on', true);
  delete from public.schedule_assignments where week_id = s.week_id and user_id = s.to_user and work_date = s.work_date;
  insert into public.schedule_assignments (week_id, branch_id, user_id, work_date, source)
  values (s.week_id, s.branch_id, s.from_user, s.work_date, 'manager') on conflict do nothing;
  if s.swap_date is not null then
    delete from public.schedule_assignments where week_id = s.week_id and user_id = s.from_user and work_date = s.swap_date;
    insert into public.schedule_assignments (week_id, branch_id, user_id, work_date, source)
    values (s.week_id, s.branch_id, s.to_user, s.swap_date, 'manager') on conflict do nothing;
  end if;
  perform set_config('app.in_swap', '', true);

  update public.schedule_swaps set status = 'reverted', reverted_by = auth.uid(), seen_by_manager_at = now()
   where id = p_swap;

  perform public.notify(s.from_user, s.branch_id, 'swap_reverted', 'Gün değişikliği patron tarafından geri alındı',
    to_char(s.work_date, 'DD.MM'), '/' || public.branch_slug(s.branch_id) || '/takvim', jsonb_build_object('swap_id', s.id));
  perform public.notify(s.to_user, s.branch_id, 'swap_reverted', 'Gün değişikliği patron tarafından geri alındı',
    to_char(s.work_date, 'DD.MM'), '/' || public.branch_slug(s.branch_id) || '/takvim', jsonb_build_object('swap_id', s.id));
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns integer
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.branches              enable row level security;
alter table public.profiles              enable row level security;
alter table public.branch_members        enable row level security;
alter table public.wage_rates            enable row level security;
alter table public.time_entries          enable row level security;
alter table public.time_entry_audit      enable row level security;
alter table public.min_staff_rules       enable row level security;
alter table public.schedule_weeks        enable row level security;
alter table public.schedule_requests     enable row level security;
alter table public.schedule_assignments  enable row level security;
alter table public.schedule_swaps        enable row level security;
alter table public.leave_requests        enable row level security;
alter table public.payments              enable row level security;
alter table public.notifications         enable row level security;

-- branches
create policy branches_select on public.branches for select to authenticated
  using (public.is_branch_member(id));
create policy branches_update on public.branches for update to authenticated
  using (public.is_branch_manager(id)) with check (public.is_branch_manager(id));
create policy branches_admin_insert on public.branches for insert to authenticated
  with check (public.is_admin());
create policy branches_admin_delete on public.branches for delete to authenticated
  using (public.is_admin());

-- profiles (no wage data lives here; colleagues may see names)
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_branch(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.manages_user(id))
  with check (id = auth.uid() or public.manages_user(id));
-- inserts/deletes happen on the server with the service role (auth admin API)

-- branch_members
create policy branch_members_select on public.branch_members for select to authenticated
  using (user_id = auth.uid() or public.is_branch_member(branch_id));
create policy branch_members_insert on public.branch_members for insert to authenticated
  with check (public.is_branch_manager(branch_id));
create policy branch_members_delete on public.branch_members for delete to authenticated
  using (public.is_branch_manager(branch_id) and user_id <> auth.uid());

-- wage_rates: own rows, or managed users
create policy wage_rates_select on public.wage_rates for select to authenticated
  using (user_id = auth.uid() or public.manages_user(user_id));
create policy wage_rates_write on public.wage_rates for all to authenticated
  using (public.manages_user(user_id) and user_id <> auth.uid())
  with check (public.manages_user(user_id) and user_id <> auth.uid());

-- time_entries
create policy time_entries_select on public.time_entries for select to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(branch_id));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check ((user_id = auth.uid() and public.is_branch_member(branch_id)) or public.is_branch_manager(branch_id));
create policy time_entries_update on public.time_entries for update to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(branch_id))
  with check (user_id = auth.uid() or public.is_branch_manager(branch_id));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (public.is_branch_manager(branch_id));

-- audit: readable when the entry is readable; written only by triggers
create policy time_entry_audit_select on public.time_entry_audit for select to authenticated
  using (exists (select 1 from public.time_entries e where e.id = entry_id));

-- min_staff_rules
create policy min_staff_select on public.min_staff_rules for select to authenticated
  using (public.is_branch_member(branch_id));
create policy min_staff_write on public.min_staff_rules for all to authenticated
  using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id));

-- schedule_weeks
create policy schedule_weeks_select on public.schedule_weeks for select to authenticated
  using (public.is_branch_member(branch_id));
create policy schedule_weeks_write on public.schedule_weeks for all to authenticated
  using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id));

-- schedule_requests
create policy schedule_requests_select on public.schedule_requests for select to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(public.week_branch(week_id)));
create policy schedule_requests_insert on public.schedule_requests for insert to authenticated
  with check ((user_id = auth.uid() and public.is_branch_member(public.week_branch(week_id)))
              or public.is_branch_manager(public.week_branch(week_id)));
create policy schedule_requests_update on public.schedule_requests for update to authenticated
  using (user_id = auth.uid() or public.is_branch_manager(public.week_branch(week_id)))
  with check (user_id = auth.uid() or public.is_branch_manager(public.week_branch(week_id)));

-- schedule_assignments: employees see only published weeks; managers see all
create policy schedule_assignments_select on public.schedule_assignments for select to authenticated
  using (public.is_branch_manager(branch_id)
         or (public.is_branch_member(branch_id)
             and exists (select 1 from public.schedule_weeks w where w.id = week_id and w.status = 'locked')));
create policy schedule_assignments_write on public.schedule_assignments for all to authenticated
  using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id));

-- schedule_swaps: writes only through RPCs; managers may mark as seen
create policy schedule_swaps_select on public.schedule_swaps for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or public.is_branch_manager(branch_id));
create policy schedule_swaps_manager_update on public.schedule_swaps for update to authenticated
  using (public.is_branch_manager(branch_id)) with check (public.is_branch_manager(branch_id));

-- leave_requests
create policy leave_select on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or public.manages_user(user_id));
create policy leave_insert on public.leave_requests for insert to authenticated
  with check (user_id = auth.uid() or public.manages_user(user_id));
create policy leave_update on public.leave_requests for update to authenticated
  using (public.manages_user(user_id)) with check (public.manages_user(user_id));
create policy leave_delete_own_pending on public.leave_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- payments: managers of the paying branch; employees only rows marked visible
create policy payments_select on public.payments for select to authenticated
  using (public.is_branch_manager(branch_id) or (user_id = auth.uid() and visible_to_employee));
create policy payments_write on public.payments for all to authenticated
  using (public.is_branch_manager(branch_id) and public.manages_user(user_id))
  with check (public.is_branch_manager(branch_id) and public.manages_user(user_id));

-- notifications: own only
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.entry_earnings, public.monthly_earnings, public.daily_branch_cost to authenticated;
-- audit and swaps are written by SECURITY DEFINER code only
revoke insert, update, delete on public.time_entry_audit from authenticated;
revoke insert, delete on public.schedule_swaps from authenticated;
revoke insert, delete on public.notifications from authenticated;

-- helper functions used inside RLS must be executable by authenticated
grant execute on function
  public.app_tz(), public.local_today(), public.my_role(), public.is_admin(),
  public.is_branch_member(uuid), public.is_branch_manager(uuid), public.manages_user(uuid),
  public.shares_branch(uuid), public.week_branch(uuid), public.compute_work_date(timestamptz, uuid),
  public.round_minutes(timestamptz, timestamptz), public.week_deadline(uuid, date), public.branch_slug(uuid)
to authenticated;

-- public RPCs
grant execute on function
  public.clock_in(uuid), public.clock_out(), public.approve_entries(uuid[]),
  public.template_days(uuid, uuid), public.close_week_now(uuid), public.publish_week(uuid),
  public.request_swap(uuid, date, uuid, date), public.respond_swap(uuid, boolean),
  public.cancel_swap(uuid), public.revert_swap(uuid), public.mark_notifications_read(uuid[])
to authenticated;

-- internal: never callable through the API
revoke execute on function
  public.notify(uuid, uuid, text, text, text, text, jsonb),
  public.notify_branch_managers(uuid, text, text, text, text, jsonb),
  public.template_days_internal(uuid, uuid), public.ensure_schedule_weeks(),
  public.build_week_draft(uuid), public.close_due_weeks(), public.run_schedule_jobs()
from public, anon, authenticated;

-- server-side scripts (service role) may run the schedule jobs directly
grant execute on function
  public.ensure_schedule_weeks(), public.build_week_draft(uuid),
  public.close_due_weeks(), public.run_schedule_jobs()
to service_role;

-- Realtime: notifications badge
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
