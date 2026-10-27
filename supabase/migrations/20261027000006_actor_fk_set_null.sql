-- D-44: accounts can be permanently deleted ("Hesabı sil").
-- Rows a user *owns* (user_id) already cascade. Columns that only record which
-- manager *acted* (approved, created, published, decided…) had no ON DELETE
-- clause, so deleting a yönetici who ever approved an entry failed with an FK
-- error. Keep those rows and blank out the actor instead.

alter table public.wage_rates
  drop constraint wage_rates_created_by_fkey,
  add constraint wage_rates_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.time_entries
  drop constraint time_entries_approved_by_fkey,
  add constraint time_entries_approved_by_fkey
    foreign key (approved_by) references public.profiles (id) on delete set null;

alter table public.time_entry_audit
  drop constraint time_entry_audit_changed_by_fkey,
  add constraint time_entry_audit_changed_by_fkey
    foreign key (changed_by) references public.profiles (id) on delete set null;

alter table public.schedule_weeks
  drop constraint schedule_weeks_published_by_fkey,
  add constraint schedule_weeks_published_by_fkey
    foreign key (published_by) references public.profiles (id) on delete set null;

alter table public.schedule_swaps
  drop constraint schedule_swaps_reverted_by_fkey,
  add constraint schedule_swaps_reverted_by_fkey
    foreign key (reverted_by) references public.profiles (id) on delete set null;

alter table public.leave_requests
  drop constraint leave_requests_decided_by_fkey,
  add constraint leave_requests_decided_by_fkey
    foreign key (decided_by) references public.profiles (id) on delete set null;

alter table public.payments
  drop constraint payments_created_by_fkey,
  add constraint payments_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.shifts
  drop constraint shifts_created_by_fkey,
  add constraint shifts_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.shift_week_publications
  drop constraint shift_week_publications_published_by_fkey,
  add constraint shift_week_publications_published_by_fkey
    foreign key (published_by) references public.profiles (id) on delete set null;

alter table public.shift_requests
  drop constraint shift_requests_decided_by_fkey,
  add constraint shift_requests_decided_by_fkey
    foreign key (decided_by) references public.profiles (id) on delete set null;
