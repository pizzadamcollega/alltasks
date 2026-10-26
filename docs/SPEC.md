# Functional specification — Pizzadam Şube ERP

Version 1.0 · 25 October 2026 · Owner: Furkan

This is the source of truth for **behaviour**. Database enforcement of every rule below lives in
`supabase/migrations/20261025000001_init.sql`; section numbers here are referenced from code
comments and tests as `SPEC §n`.

---

## 1. Scope

### 1.1 Goal
A private web app (installable as a PWA on phones) for Pizzadam's branches where:

- employees record shifts with **Başla / Bitir**, see their own daily/weekly/monthly hours and
  earnings, pick their working days for upcoming weeks, give days to colleagues and request leave;
- the branch boss (**patron**) approves hours at the end of each day, builds and publishes the
  weekly schedule, manages employees, wages, payments and advances, and exports monthly reports;
- the **admin** does everything a patron does, across all branches.

### 1.2 Branches (v1)

| Slug | Name | Address | Open | Staff |
| --- | --- | --- | --- | --- |
| `de-pijp` | Pizzadam De Pijp | Ferdinand Bolstraat 64h, 1072 LM Amsterdam | daily 16:00–03:00 | ~6–9 |
| `zuid` | Pizzadam Zuid | Heemstedestraat 17, 1059 CX Amsterdam | daily 16:45–03:00 | ~6–9 |

More branches can be added by the admin later (row in `branches` + min-staff rules).

### 1.3 In scope (v1)
Clock in/out · employee self-correction with "Düzenlendi" flag and audit trail · end-of-day
approval · per-person hourly wage with history · earnings (day/week/month) · day-based weekly
schedule with templates, request deadline, auto-template for non-responders, draft, publish/lock ·
day give-away and swap between employees after publish · leave/holiday requests · minimum staff
warnings · payments & advances with per-record employee visibility · monthly reports ·
Excel + PDF export · in-app notifications (with live badge) · light/dark/system theme per user ·
Turkish UI · installable PWA.

### 1.4 Out of scope (v1) — candidates for v2
WhatsApp notifications (plan: n8n workflow reading `notifications`) · location/Wi-Fi check on
clock-in · break deduction · tips · courier per-delivery pay · shift times inside a day (only whole
days are scheduled) · net salary/tax (loonheffing) · languages other than Turkish · offline mode.

---

## 2. Roles & permissions

Three roles (`profiles.role`). One person has exactly one role.

| Capability | Admin | Patron | Çalışan (employee) |
| --- | :-: | :-: | :-: |
| Branches visible | all | exactly one (own) | the ones they're a member of (1 or 2) |
| Create / deactivate employee accounts | ✅ any branch | ✅ own branch, role `employee` only | ❌ |
| Create patron / admin accounts | ✅ | ❌ | ❌ |
| Reset an employee's password | ✅ | ✅ (own branch) | ❌ — changes own password only |
| Set / change hourly wage | ✅ | ✅ (employees of own branch) | ❌ — sees own wage |
| Clock in / out | – | – | ✅ |
| Correct own entry **before** approval | – | – | ✅ (flagged "Düzenlendi") |
| Approve / edit any entry of the branch | ✅ | ✅ | ❌ |
| Add a missing entry for someone | ✅ | ✅ | ❌ |
| See others' hours and earnings | ✅ | ✅ (own branch) | ❌ |
| See colleagues' names and the published schedule | ✅ | ✅ | ✅ (shared branches) |
| Submit weekly day requests | – | – | ✅ |
| Build, edit, publish the schedule | ✅ | ✅ | ❌ |
| Give away / swap a day after publish | – | – | ✅ (needs the colleague's OK) |
| Revert a swap | ✅ | ✅ | ❌ |
| Request leave | – | – | ✅ |
| Decide leave | ✅ | ✅ | ❌ |
| Record payments / advances | ✅ | ✅ (own branch) | ❌ — sees only records marked visible |
| Branch settings (deadline, min staff) | ✅ | ✅ | ❌ |
| Reports & export | ✅ (per branch or all) | ✅ (own branch) | ❌ |

Rules:
- A patron is member of **exactly one** branch (DB trigger).
- An employee may belong to **both** branches. Their hourly wage is the same in both (wage is
  per person, not per branch). Each branch's patron sees only the entries, schedule and payments
  of **their** branch for that person, but sees the person's wage.
- Admin does not need branch membership; admin sees a branch switcher.
- Patrons and admins do **not** clock in (v1). If a patron also works shifts, they get a separate
  employee account (DECISIONS D-07).

---

## 3. Access, URLs and login

- App URL (v1): `https://pizzadam.vercel.app` (fallback `pizzadam-erp.vercel.app` if the name
  is taken; final custom domain later).
- Each branch has its own entry URL: `/<slug>/giris` → e.g. `/de-pijp/giris`, `/zuid/giris`.
  The branch in the URL is the working context for every page under `/<slug>/…`.
- Login = **username + password**. Staff have no e-mail; each account uses a synthetic,
  undeliverable e-mail `<username>@staff.pizzadam.invalid` (`STAFF_EMAIL_DOMAIN`) that users never
  see. Username rules: lowercase `a-z 0-9 . _ -`, 3–32 chars, starts with a letter/digit,
  e.g. `ahmet.yilmaz`.
- After login the user must be a member of the URL's branch (or admin); otherwise sign out and show
  **"Bu şubeye kayıtlı değilsin."**
- An employee in both branches logs in at either URL and can switch branch from the profile menu.
- Sessions are long-lived (refresh tokens) so staff stay signed in on their phone. "Çıkış yap" in
  Profil.
- `/` shows a neutral page: "Şubenin giriş adresini kullan" + last used branch link (cookie).
- The whole site sends `X-Robots-Tag: noindex, nofollow` and `robots.txt` disallows everything.
- No self-registration. Accounts are created by patron/admin (§10).
- Password: min 8 characters. Employee changes it in Profil (asks current password). Patron resets
  it by setting a new temporary password and telling the employee.
- Deactivated users (`active = false`) are banned in Supabase Auth and cannot log in; their history
  stays for reports.

---

## 4. Time entries (mesai kayıtları)

### 4.1 Clock in / out
- **Başla** (`rpc clock_in(branch_id)`): creates an `open` entry with `start_at = now()` (server
  time — the client never sends a start time). Only one open entry per person at a time (across
  branches). Allowed only in a branch the person belongs to.
- **Bitir** (`rpc clock_out()`): sets `end_at = now()`; status becomes `pending`.
- There is **no pause** button and breaks are **not** deducted.
- A running entry shows a live timer `HH:MM:SS` on the employee home screen.
- Maximum entry length 16 h (DB check). Opening a new entry while one is open is refused with
  "Zaten açık bir mesain var".

### 4.2 Business day (`work_date`)
- The entry belongs to the **local date of its start** (Europe/Amsterdam), except that a start
  **before the branch's day cutoff (06:00)** belongs to the **previous** day. So 17:00–01:30 and
  00:30–02:00 both count for the evening they belong to.
- `work_date` is computed by trigger; it never comes from the client.

### 4.3 Rounding
- Duration = real elapsed time `end_at − start_at`, rounded to the **nearest 5 minutes**
  (`round(seconds / 300) × 5`; exactly half rounds up): 7 → 5, 8 → 10, 2 h 32 min 30 s → 2 h 35.
- Each entry is rounded individually; totals are sums of rounded entries.
- **Daylight-saving nights:** elapsed time is real time. On the last Sunday of October a shift
  17:00–03:00 lasts 11 h; on the last Sunday of March it lasts 9 h. This is correct and shown as is.

### 4.4 Employee corrections
- Before approval the employee may change **start** and **end** of their own entry (e.g. forgot to
  press Bitir). The entry gets the **"Düzenlendi"** tag and every change is written to
  `time_entry_audit` (old/new values, who, when).
- The first Bitir is not an edit. Times in the future (> now + 5 min) are refused.
- After approval the employee can no longer change the entry ("Onaylanmış kayıt değiştirilemez").
- Employees cannot create past entries; if they forgot to press Başla, they tell the patron, who
  adds the entry.

### 4.5 End-of-day approval (gün sonu onayı)
- The patron opens **Gün sonu onayı** for a business day (default: yesterday, because shops close
  at 03:00). The list shows every entry of that day in the branch:
  name, hourly wage, start–end, rounded duration, amount, tags (Düzenlendi + first original time,
  "Bitirilmedi" for still-open entries).
- Actions per entry: **Onayla**, **Düzenle** (change start/end), **Sil** (with confirm).
  Bulk: **"Kalan N kaydı onayla"** approves all `pending` entries of the day.
- Open entries cannot be approved: the patron sets the end time first (then it becomes pending).
- Patron edits mark the entry `edited_by_manager` and **notify the employee**
  ("Mesai kaydın düzenlendi"). Patrons can edit approved entries too (stays approved).
- Patron can add a missing entry for a person and day ("+ Kayıt ekle").
- Header totals: approved/total count, total time and total cost of the day (open entries excluded).

### 4.6 Statuses

| Status | Meaning | Who changes |
| --- | --- | --- |
| `open` | running, no end time | → `pending` on Bitir or when an end time is set |
| `pending` | finished, waiting for the patron | → `approved` by patron |
| `approved` | locked for the employee | patron may still edit / un-approve |

---

## 5. Wages and earnings

- Each person has an hourly wage history (`wage_rates`: rate + `effective_from` date). The rate for
  an entry is the latest one with `effective_from ≤ work_date`. Changing a wage never changes past
  days.
- **Entry amount** = `rounded_minutes / 60 × rate`, rounded to cents per entry.
- **Earnings shown to the employee** (Ana sayfa, Geçmiş):
  - *Onaylı* = sum of approved entries; *Bekleyen* = pending entries (shown as "tahmini");
    the running entry is shown only on the home screen as "Bugün · tahmini".
  - Day / week (Mon–Sun) / month views, by `work_date`.
- **Branch cost** = sum of amounts per branch & day (`daily_branch_cost` view) and per month.
- Earnings are **gross** amounts (no tax). The app is not a payroll system.

---

## 6. Payments and advances (ödeme / avans)

- Patron records per person, per branch and month: kind (**Ödeme** = salary payment, **Avans** =
  advance), amount, date paid, note.
- Each record has a **"Çalışana görünür"** switch (default off). Employees see **only** records
  with the switch on; if none are visible the whole Ödemeler block is hidden for them (not empty).
  Turning the switch on notifies the employee.
- Month balance per person & branch: **Kalan = onaylı tutar − avanslar − ödemeler** of that
  month. Shown to the patron always; shown to the employee only when at least one payment record
  of that month is visible (then the employee sees hesaplanan, visible records and kalan).
- Payment period is **monthly**.

---

## 7. Weekly schedule (haftalık program)

### 7.1 Concepts
- Planning unit = **whole day** (no shift times). A schedule week runs **Monday–Sunday**.
- Per branch and week there is a `schedule_week` with a status:
  `collecting` (talep toplama) → `draft` (taslak) → `locked` (yayınlandı).
- **Template (şablon)** of a person for a week = the weekdays they worked in the **most recent
  published week** of that branch, moved to the new week. Example: published week had Mon, Wed,
  Fri → template for next week is Mon, Wed, Fri of that week.
- **Request deadline (talep kapanışı)**: weekday + time set in branch settings (default
  **Thursday 23:59**) of the week **before** the schedule week. Example: week 2–8 November closes
  on Thursday 29 October 23:59.
- Weeks are created automatically: the current week and the next two always exist (cron).

### 7.2 Employee side (Talepler → Haftalık program)
1. For each upcoming `collecting` week the employee sees 7 day toggles pre-filled with their
   **template** and the deadline.
2. Unchanged → **"Şablonu onayla"** (stores `template_ok`).
   Changed → **"Değişikliği gönder"** (stores `change` with the chosen days); "Şablona dön" resets.
3. They can resubmit until the deadline. Days covered by **approved leave** cannot be chosen.
4. Non-responders: at the deadline their template is used automatically (`auto = true`).

### 7.3 Deadline → draft (automatic)
At the deadline (cron every 10 min, or patron's **"Talepleri şimdi kapat"**):
- for each active employee of the branch: requested days (if any request) else template days,
  minus approved-leave days → assignments;
- week becomes `draft`; patron(s) and admin get **"Program taslağı hazır"** with the number of days
  below minimum staff.

### 7.4 Patron side (Program)
- Week selector (this week, next, +2) with status chip.
- `collecting`: list of who answered (onayladı / değişiklik / yanıt yok) and **"Talepleri şimdi
  kapat"**.
- `draft`: per day the assigned people as chips; chips from an employee's change are marked
  (dashed, "Çalışan değişikliği"); days below **minimum staff** are red with "x / min · eksik".
  Patron removes a chip (tap → remove) or adds a person ("+ Kişi ekle" → list of branch employees not
  on that day, those who requested that day first).
- **"Programı yayınla ve kilitle"** (`rpc publish_week`): allowed even with warnings (shows
  "N gün minimum personelin altında. Yine de yayınlayabilirsin."). Every employee is notified:
  "Haftalık program yayınlandı" — or **"Programın patron tarafından düzenlendi"** if they had sent a
  change and got different days.
- The published week becomes the **template** for the next one.
- Patron can still edit a `locked` week; each added/removed day notifies the employee
  ("Programına bir gün eklendi / Programından bir gün çıkarıldı").

### 7.5 After publish: give away / swap (Takvim)
- An employee taps **"Günü devret"** on one of their own future days in a published week, picks a
  colleague who is **not** working that day, optionally a day of the colleague's to take in return
  (takas), and sends the request (`rpc request_swap`).
- The colleague gets a notification and **accepts or declines** (`rpc respond_swap`). On accept the
  schedule changes immediately; both see it; patron(s) get **"Çalışanlar gün değiştirdi"** in the
  alert strip.
- The patron can **revert** an accepted swap (`rpc revert_swap`); both employees are notified.
- The requester can cancel while pending. Past days can't be swapped. If the schedule changed in
  between, accepting fails with "Program değiştiği için bu talep artık uygulanamıyor".

### 7.6 Visibility
- Employees see **published** weeks of their branches — the whole team, their own name as "Sen".
- Drafts are visible to patron/admin only.

### 7.7 Minimum staff
Per branch and weekday (Ayarlar). Default Mon–Thu 4, Fri–Sat 6, Sun 4. Used for warnings only
(draft, published week, approving leave). Never blocks publishing.

---

## 8. Leave and holiday (izin / tatil)

- Employee sends: type (**İzin** or **Tatil**), start date, end date (≤ 61 days), optional note.
  Not for past dates. Can delete it while pending.
- Patron(s) of all the employee's branches are notified and see it in the alert strip /
  Talepler inbox; one of them **approves or rejects** with an optional note. Employee is notified.
- Approved leave days:
  - can't be selected in weekly requests and are skipped when drafts are built;
  - if they overlap an already **published** week, patrons get **"Onaylı izin programla
    çakışıyor"** and adjust the schedule manually.
- Leave is not paid time and creates no entries.

---

## 9. Notifications

In-app only in v1 (`notifications` table, Realtime badge on the bell icon, list page with "tümünü
okundu say"). Each has a title, short body and deep link.

| Kind | To | When |
| --- | --- | --- |
| `entry_edited_by_manager` | employee | patron changed their entry times |
| `week_draft_ready` | patrons + admin | deadline passed, draft built |
| `program_published` / `program_changed` | each employee | week published (changed = differs from their own change request) |
| `program_changed` | employee | patron added/removed their day in a published week |
| `swap_requested` | colleague | someone offers them a day |
| `swap_accepted` / `swap_declined` | requester | colleague answered |
| `swap_done` | patrons + admin | swap applied |
| `swap_reverted` | both employees | patron reverted a swap |
| `leave_requested` | patrons + admin | new leave request |
| `leave_decided` | employee | approved / rejected |
| `leave_conflict` | patrons + admin | approved leave overlaps a published week |
| `payment_recorded` | employee | a payment/advance became visible |

The patron home **alert strip** is computed live (not from notifications): pending entries of
yesterday/today, open entries from previous days, pending leave requests, unseen swaps, upcoming
days below minimum staff, week status (draft waiting / deadline soon).

v2: WhatsApp via n8n (Supabase webhook on `notifications` insert → n8n → WhatsApp Business API).

---

## 10. Account management

- **Yeni çalışan** (Ayarlar → Çalışan hesapları, or Çalışanlar → +): full name, username, temporary
  password, hourly wage, start date (= first `effective_from`), branches (admin: any; patron: own,
  fixed). Server action creates the Supabase auth user, profile, memberships and first wage in one
  go; rolls back the auth user if any step fails.
- **Çalışan profili** (patron): identity, branches, status, wage + history + "Ücreti değiştir"
  (new rate + effective date, default 1st of next month), month summary (saat, hesaplanan, avans,
  ödenen, kalan), payments list with visibility switches, recent entries, **Şifreyi sıfırla**,
  **Hesabı pasife al / aktifleştir**.
- Usernames are fixed after creation (change only via admin script).
- Admin manages patrons with `npm run create-user` (v1) — no admin UI for patrons needed.

---

## 11. Reports and export

- **Raporlar** (patron: own branch; admin: one branch or all): month selector.
  - Summary: approved cost, approved hours, people count, pending cost.
  - Daily cost chart for the month (approved vs pending).
  - Per-person table: hours, hesaplanan, avans, ödenen, kalan → tap opens Çalışan profili.
- **Export** (`/api/export?branch=&month=&format=xlsx|pdf`):
  - **Excel** `Pizzadam_<Şube>_<YYYY-MM>.xlsx`, sheets:
    1. *Özet*: Çalışan, Kullanıcı adı, Saatlik ücret (ay sonu), Onaylı saat, Onaylı tutar,
       Bekleyen saat, Bekleyen tutar, Avans, Ödenen, Kalan, totals row.
    2. *Kayıtlar*: Tarih, Gün, Çalışan, Başlangıç, Bitiş, Süre (sa:dk), Ücret, Tutar, Durum,
       Düzenlendi (çalışan/patron).
    3. *Günlük*: Tarih, Kişi sayısı, Saat, Onaylı tutar, Bekleyen tutar.
  - **PDF** (A4 portrait): header (branch, month, generated at), summary block, per-person table,
    footer "Bekleyen kayıtlar toplamlara dahil değildir."
  - Admin "Tüm şubeler" export adds a *Şube* column.
- Totals use **approved** entries only; pending shown separately.

---

## 12. Settings (Ayarlar, per branch)

- Talep kapanışı: weekday + time (default Perşembe 23:59). Changing it moves the deadline of
  weeks still collecting.
- Minimum personel per weekday (0–50) with −/+ steppers.
- Çalışan hesapları shortcut (count + "Yeni çalışan").
- Şube bilgisi: name, address, login URL with "Kopyala" (`https://…/<slug>/giris`).
- Day cutoff is fixed at 06:00 in v1 (column exists for later).
- Görünüm (also in every user's Profil): theme Aydınlık / Karanlık / Cihaz — stored per user in
  `profiles.theme`, applied on every device after login.

---

## 13. Non-functional requirements

- **Privacy / GDPR:** minimal personal data (name, username, hours, wage, payments). EU region
  (Supabase Frankfurt). No tracking, no analytics cookies. Wage and payment data protected by RLS.
  Deactivated accounts keep history for bookkeeping; full deletion on request = admin deletes the
  auth user (cascades).
- **Performance:** first load < 2.5 s on 4G for the employee home; Başla/Bitir respond < 1 s.
- **Reliability:** nightly database backup (GitHub Action `pg_dump`, see ARCHITECTURE §9).
- **Hosting:** Vercel + Supabase. Note: Vercel's free Hobby plan is for non-commercial personal use
  only, so production for the business should run on Vercel **Pro** (DECISIONS D-11).
- **Browsers:** last 2 versions of iOS Safari, Chrome Android, desktop Chrome/Edge/Firefox/Safari.
- **Accessibility:** WCAG 2.1 AA on all screens.
- **Time zone:** Europe/Amsterdam for everything shown; DST handled (§4.3).

---

## 14. Edge cases (must be handled)

| # | Case | Expected |
| --- | --- | --- |
| E1 | Employee forgets Bitir | Entry stays open; next day patron sees "Bitirilmedi" in Gün sonu onayı and sets the end. Employee can also set it themselves (→ Düzenlendi). Başla is blocked until it's closed. |
| E2 | Shift crosses midnight | Counts for the start evening (§4.2). |
| E3 | Start after midnight (00:30) | Counts for the previous day (cutoff 06:00). |
| E4 | DST night | Real elapsed time (§4.3). |
| E5 | Wage changes mid-month | Days before the effective date keep the old rate. |
| E6 | Employee in both branches | Separate entries/requests/schedules per branch; one wage; one open entry at a time overall. |
| E7 | Patron edits a published week | Employee notified per change. |
| E8 | Swap accepted after patron changed the day | Refused with clear message; swap marked cancelled. |
| E9 | Leave approved for a published week | Patrons warned; schedule not auto-changed. |
| E10 | Employee deactivated mid-week | Removed from future drafts; existing assignments stay until patron removes them; cannot log in. |
| E11 | No previous published week (first use) | Template empty; patron builds the first week by hand. |
| E12 | Patron changes deadline | Collecting weeks' deadlines move. |
| E13 | More than one patron | A branch may have several patrons (all get the same rights and notifications); one patron can never belong to two branches. |
| E14 | Clock-in at the wrong branch URL | Allowed only if member; entry belongs to that branch. |
| E15 | Network error on Başla/Bitir | Button shows spinner, retries once, then toast "Bağlantı yok, tekrar dene." Never create duplicates (DB unique open entry). |
