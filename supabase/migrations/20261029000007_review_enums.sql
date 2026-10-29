-- D-45: staff duties and the two-step (kasacı → yönetici) review flow.
-- Enum values are added in their own migration: Postgres refuses to *use* a
-- value added by `alter type … add value` inside the same transaction, and the
-- next migration (…000008) uses them in functions, defaults and checks.

alter type public.entry_status add value if not exists 'cashier_approved' after 'pending';
alter type public.entry_status add value if not exists 'returned';

create type public.staff_duty    as enum ('kasaci', 'bezorgd', 'usta');
create type public.review_status as enum ('pending', 'cashier_approved', 'approved', 'returned');
