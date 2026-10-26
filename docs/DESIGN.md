# Design — Pizzadam Şube ERP

Mockups (11 phone screens, light + dark, clickable): the canvas
"Pizzadam Şube ERP — Mobil Ekranlar" on claude.ai (owner's account). The same screens are copied
as markup into `docs/mockups/*.dc.html` — open them in an editor to read exact spacing, sizes and
copy. They are reference markup (a design-tool format with `{{holes}}`), **not** code to import.

| Mockup file | Screen | Route |
| --- | --- | --- |
| `Giris.dc.html` | Login | `/[branch]/giris` |
| `Main.dc.html` | Employee home | `/[branch]` (employee) |
| `Takvim.dc.html` | Team schedule + give-away sheet | `/[branch]/takvim` |
| `Talepler.dc.html` | Weekly request + leave | `/[branch]/talepler` (employee) |
| `Gecmis.dc.html` | History & earnings | `/[branch]/gecmis` |
| `Patron.dc.html` | Manager home | `/[branch]` (manager) |
| `Onay.dc.html` | End-of-day approval | `/[branch]/onay` |
| `Program.dc.html` | Weekly schedule draft | `/[branch]/program` |
| `Calisan.dc.html` | Employee profile (manager) | `/[branch]/calisanlar/[id]` |
| `Raporlar.dc.html` | Reports + export | `/[branch]/raporlar` |
| `Ayarlar.dc.html` | Branch settings | `/[branch]/ayarlar` |

## 1. Principles

- **One thumb, one glance.** The most frequent action of each role is the biggest thing on its
  home screen: Başla/Bitir (employee, top-left card) and the alert strip (patron).
- Numbers first, labels second: amounts and hours are large and tabular (`font-variant-numeric:
  tabular-nums`).
- Status is always **text + colour** ("Bekliyor" on amber), never colour alone.
- Calm surfaces, one accent (the logo's crimson red). No gradients, no shadows except the active
  segment.
- Same layout in light and dark; only tokens change.

## 2. Tokens

Implement as CSS variables on `:root` and `.dark` (Tailwind `@theme` / shadcn convention), names
below are the source of truth.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#F6F4F1` | `#141210` | page background |
| `--surface` | `#FFFFFF` | `#1E1B18` | cards, nav, sheets |
| `--surface-2` | `#F0EDE8` | `#29251F` | chips, segmented track, avatars |
| `--text` | `#1C1917` | `#F3EFEA` | primary text |
| `--muted` | `#665E57` | `#A9A096` | secondary text (≥ 4.5:1 on surface) |
| `--border` | `#E4DFD8` | `#37322B` | card borders, dividers |
| `--accent` | `#BE1E2D` | `#EB4A5B` | primary buttons, active nav, today |
| `--accent-soft` | `#FBE8E9` | `#3A1419` | worked days, avatar bg, soft buttons |
| `--on-accent` | `#FFFFFF` | `#23090C` | text on accent |
| `--ok` / `--ok-soft` | `#1E7549` / `#E3F3EA` | `#5CC98E` / `#16301F` | Onaylandı, Mesaide |
| `--warn` / `--warn-soft` | `#8F5400` / `#FDF0D9` | `#F2B04A` / `#33260F` | Bekliyor, Düzenlendi |
| `--bad` / `--bad-soft` | `#B42318` / `#FDE7E5` | `#F27C6F` / `#3A1A17` | Eksik, Bitirilmedi, Reddedildi, destructive |
| `--info` / `--info-soft` | `#1D5FA8` / `#E6EEF9` | `#7FB2F0` / `#172739` | template notices, employee changes |
| `--switch-off` | `#C9C2B9` | `#4A443C` | switch track off |

Brand note: `--accent` is sampled from the pizza-slice logo (`pizza.svg`, crust/pepperoni `#BE1E2D`).
The dark-mode value is a lightened derivative, not re-sampled from any dark-mode artwork — verify
its contrast with a checker (text on accent ≥ 4.5:1) and nudge the tint if it ever fails; matching
the logo exactly is secondary to readability (DECISIONS.md D-23).

**Type:** Inter (Google Fonts, `next/font`), fallback system-ui.

| Style | Size / weight | Use |
| --- | --- | --- |
| Display number | 30–32 / 700, letter-spacing −0.6 | month totals |
| Timer | 30 / 700 | running shift |
| H1 | 20–22 / 700 | page titles |
| H2 | 16 / 700 | section titles |
| Body | 14–15 / 400–600 | rows |
| Small | 12–13 / 400–600 | secondary lines |
| Micro | 11 / 600 | chips, nav labels (min) |

**Spacing:** 4-pt grid; page side padding 16; gap between sections 14–16; card padding 14–16.
**Radius:** cards 16, buttons/inputs 12, small buttons 10, chips 999, sheets 22 (top).
**Touch:** every control ≥ 44×44; primary bottom buttons 48–52 high.

## 3. Layout

- Mobile (default, 390 wide): header (title left, theme toggle + bell + avatar/settings right) →
  scrollable content → fixed **bottom nav** (employee 4 items, manager 5 items) → safe-area padding.
- ≥ 1024 px (patron on a laptop): bottom nav becomes a left sidebar; content max-width 960, two
  columns where useful (home: alert strip + week | stats + today list; approval: list | detail).
- Sticky bottom action bar for pages with a primary action (Onay, Program, Raporlar, Ayarlar).
- Bottom sheets (`Sheet` from shadcn, side="bottom") for: give-away, add person to day, edit entry,
  new payment, change wage.

### Navigation

| Role | Bottom nav (icon · label) |
| --- | --- |
| Employee | Home · **Ana sayfa**, Calendar · **Takvim**, Message · **Talepler**, Clock · **Geçmiş** |
| Patron / Admin | Home · **Ana sayfa**, Check · **Onay** (badge = pending count), Calendar · **Program**, Users · **Çalışanlar**, Bar chart · **Raporlar** |

Header right: bell (badge = unread notifications) → `/bildirimler`; theme toggle; avatar → Profil
(employee) / gear → Ayarlar (manager). Admin: branch switcher (select) under the title.

## 4. Components (build in `components/app`)

| Component | Spec |
| --- | --- |
| `ClockCard` | Surface card, top-left on employee home. Row: status dot + label ("Mesaide · 16:55'ten beri" / "Mesai bitti · onay bekliyor" / "Mesaide değilsin"), branch name right. Timer `HH:MM:SS` 30/700. One full-width button: **Başla** (accent) or **Bitir** (accent). Optimistic UI + disabled while pending. |
| `StatCard` | label (13/600 muted), value (20 or 32/700), sub line (12 muted). Grid 2 cols; the main one spans 2. |
| `AlertStrip` | Card with rows: count badge (28×28, rounded 8, soft colour by type) · title 14/600 · sub 12 muted · chevron. Whole row is a link. Types: warn (onay), info (talep, değişiklik), bad (eksik personel, bitirilmedi). Hidden when empty → show "Bekleyen iş yok ✓". |
| `WeekStrip` | 7 equal columns: day short (11/600), date (16/700), mark (10). States: today (accent bg), work (accent-soft), off (dashed border, muted). In Talepler they are toggle buttons with `aria-pressed`; changed-from-template = dashed info border. |
| `DayRow` (schedule) | Card per day: day name 15/700 + date muted + count chip right ("4 / 4", red "3 / 4 · eksik"); people chips (32 high; own = accent "Sen"; employee change = dashed info; template = surface-2). |
| `EntryRow` | date 14/600, "start – end · duration" 13 muted, tags (Düzenlendi outline), status chip right. |
| `ApprovalCard` | avatar + name + rate; big time "16:55 – 01:30", duration, amount right; warn line for edits ("Düzenlendi · ilk giriş 17:20 başlangıç"); red border + time input for open entries; actions Düzenle (outline) / Onayla (solid text-colour) → Onaylandı ✓ (ok soft). |
| `StatusChip` | 11/600, padding 3×8, radius 999: Onaylandı (ok), Bekliyor (warn), Eksik/Bitirilmedi/Reddedildi (bad), Taslak (warn), Kilitli/Yayınlandı (ok), Mesaide (ok). |
| `Segmented` | track surface-2, radius 14, padding 4; active segment surface + subtle shadow; height 44. Used for week tabs, Program/İzin, Günlük/Haftalık/Aylık, theme. |
| `Switch` | 44×26 track, 20 knob, label "Görünür/Gizli" left; `role="switch"`. |
| `Stepper` | − value + (40×40 buttons), for min staff. |
| `DailyBars` | flex bars, height ∝ value / max; approved = accent, pending = warn; `role="img"` with an `aria-label` summary; x labels 1, 8, 15, 22, last. |
| `EmptyState` | icon + one line + optional action. |

## 5. Copy (Turkish) — key strings

- Başla · Bitir · Mesaide · Mesai bitti · onay bekliyor · Mesaide değilsin
- "Merhaba, {ad}" · "{gün} · Bugün programdasın" / "Bugün izinlisin" / "Bugün programda değilsin"
- "Ekim kazancım" · "tahmini" · "onay bekliyor"
- "Gelecek haftanın şablonu hazır" · "{tarih} · {gün} {saat}'e kadar yanıtla. Yanıt vermezsen
  şablon geçerli sayılır." · Şablonu onayla · Günleri değiştir · Değişikliği gönder · Şablona dön
- "Günü devret" · "{gün} kime devredilsin?" · "Talep gönder" · "Yanıt bekleniyor"
- "Gün sonu onayı" · "Kalan {n} kaydı onayla" · "Tümü onaylandı" · "Bitiş saati girilmedi"
- "Programı yayınla ve kilitle" · "{n} gün minimum personelin altında. Yine de yayınlayabilirsin."
- "Yeni ücreti kaydet" · "Geçmiş günler eski ücretle hesaplanmaya devam eder."
- "Görünürlüğü kapalı kayıtlar çalışanın ekranında hiç gösterilmez."
- Errors: "Bağlantı yok, tekrar dene." · "Bir hata oluştu, tekrar dene."

## 6. Dates & numbers

- Dates: `Cumartesi 24 Ekim`, short `24 Eki`, ranges `2–8 Kasım`, `26 Eki–1 Kas`.
- Durations: `8 sa 35 dk`; < 1 h `40 dk`.
- Money: `€812,50`, thousands `€6.510,40` (`tr-TR`).
- Week starts Monday; weekday names Pazartesi … Pazar; short Pzt Sal Çar Per Cum Cmt Paz.
