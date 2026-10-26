# Screens — Pizzadam Şube ERP

Every screen: route, who can open it, the data it reads, its sections, its actions and its states.
Visuals: `docs/mockups/<File>.dc.html` and DESIGN.md. Rules: SPEC.md. All copy Turkish.

Common to every `(app)` screen:
- **Loading**: skeletons in the shape of the cards (no spinners on whole pages).
- **Error**: inline card "Bir hata oluştu, tekrar dene." with "Yenile" button.
- **Header**: title, theme toggle, bell with unread badge, avatar (employee) / gear (manager).
- Manager-only screens redirect employees to `/[branch]`.

---

## S1 · Giriş — `/[branch]/giris` (public) · mockup `Giris`

- Data: branch name by slug via a server-side query **with the service client limited to
  `select name from branches where slug = $1`** (anon can't read branches) — or a static map; unknown
  slug → 404.
- UI: logo tile, "Pizzadam", "Personel girişi", branch chip ("De Pijp şubesi"), Kullanıcı adı
  (`autocomplete=username`, autocapitalize off), Şifre with show/hide, **Giriş yap**, help line
  "Şifreni unuttuysan patronundan sıfırlamasını iste."
- Action `signIn({ branch, username, password })`:
  - wrong credentials → "Kullanıcı adı veya şifre hatalı."
  - not a member → sign out, "Bu şubeye kayıtlı değilsin."
  - deactivated (banned) → "Hesabın pasif. Patronunla görüş."
  - success → set cookie `pz_branch=<slug>` → redirect `next` or `/[branch]`.
- Already signed in & member → redirect to `/[branch]`.

## S2 · Employee home — `/[branch]` · mockup `Main`

- Data: open entry (any branch), today's entries, `entry_earnings` for this week,
  `monthly_earnings` this month (this branch), assignments of the current **published** week for me,
  next `collecting` week (+ my request, deadline), today's assignment.
- Sections:
  1. **ClockCard** (top-left): states *idle* ("Mesaide değilsin", Başla), *running* (live timer from
     `start_at`, "Mesaide · HH:MM'den beri", Bitir), *just finished* ("Mesai bitti · onay bekliyor",
     Başla). If the open entry is in the **other** branch show "Diğer şubede mesaidesin (Zuid)" and
     Bitir still works.
  2. Greeting "Merhaba, {ad}" + "{Gün tarih} · Bugün programdasın / Bugün programda değilsin /
     Bugün izinlisin".
  3. Stats: **{Ay} kazancım** (approved + pending, sub "x sa y dk · z onay bekliyor"), **Bugün**
     (incl. running, "tahmini"), **Bu hafta**.
  4. **Template notice** (only while a collecting week exists and I haven't answered): title, date
     range, deadline sentence; buttons *Şablonu onayla* (one tap → `template_ok`) and *Günleri
     değiştir* (→ Talepler).
  5. **Bu haftaki programım**: WeekStrip of the current published week (or "Bu hafta için program
     yayınlanmadı"), line "n gün çalışıyorsun", link *Ekip programı* → Takvim.
  6. **Son kayıtlar** (last 3) with status chip, Düzenlendi tag; tap → edit sheet (if not approved)
     or details; link *Tümü* → Geçmiş.
- Actions: `clockIn(branchId)`, `clockOut()`, `approveTemplate(weekId)`, `editOwnEntry(id, start,
  end)` (sheet with two `datetime-local` inputs, validation: end > start, ≤ 16 h, not future).

## S3 · Takvim (ekip programı) — `/[branch]/takvim` · mockup `Takvim`

- Employees only (managers → `/program`).
- Data: published weeks (current, next), assignments with names, my pending swaps (sent/received).
- UI: Segmented *Bu hafta · dd–dd* / *Gelecek · dd–dd*; info line; one **DayRow** per day; own
  chip "Sen"; my day cards have accent border.
- Received swap requests on top as cards: "{Ad}, {gün}'ü sana devretmek istiyor" (+ "karşılığında
  {gün}") → **Kabul et** / **Reddet**.
- On my future day: **Günü devret** → bottom sheet: title "{Gün tarih} kime devredilsin?", radio
  list of colleagues not working that day, optional "Karşılığında onun bir gününü al" (select
  among the colleague's days in that week that I don't work), **Talep gönder**. Afterwards the day
  shows chip "Yanıt bekleniyor" and a status banner.
- Actions: `requestSwap`, `respondSwap`, `cancelSwap`.
- Empty: "Bu hafta için program henüz yayınlanmadı."

## S4 · Talepler (employee) — `/[branch]/talepler` · mockup `Talepler`

- Segmented **Haftalık program** / **İzin / tatil**.
- *Haftalık program*: for each collecting week (normally one; show both if two): title "2–8 Kasım
  haftası", deadline sentence, WeekStrip toggles prefilled with my current request or template
  (`rpc template_days`), approved leave days disabled with "İzinli", summary line ("5 gün seçili ·
  şablonla aynı" / "· şablondan farklı, patron onayına gidecek"), buttons *Şablona dön* (only when
  changed) and *Şablonu onayla* / *Değişikliği gönder*; success banner. After deadline: read-only
  "Talepler kapandı · program hazırlanıyor".
- *İzin / tatil*: form (type radio İzin/Tatil, start, end, note ≤ 500) → *Talep gönder*; list
  *Önceki talepler* (title "Tatil · 14–21 Aralık", sub sent date or patron note, status chip);
  pending ones have *Geri çek* (delete).
- Actions: `submitWeekRequest(weekId, days[])` (upsert on week_id+user_id, kind decided by comparing
  with template), `createLeave`, `withdrawLeave`.

## S5 · Geçmiş — `/[branch]/gecmis` · mockup `Gecmis`

- Month picker (‹ Ekim 2026 ›; future months disabled), Segmented Günlük / Haftalık / Aylık.
- Summary card: month total (approved + pending), hours, days, current hourly rate; chips
  "Onaylı €…" and "Bekleyen €…".
- List: *Günlük* = each entry (date, start–end · duration · düzenlendi, amount, status);
  *Haftalık* = Mon–Sun groups; *Aylık* = last 6 months (hours, days, amount, "Ödendi" if a visible
  payment of kind `payment` exists).
- **Ödemeler** block only if the month has ≥ 1 visible payment record: Hesaplanan, each visible
  record (−amount), **Kalan**.

## S6 · Profil — `/[branch]/profil`

- Name, username, branches (switch branch links if 2), current hourly rate (employee).
- **Görünüm**: Segmented Aydınlık / Karanlık / Cihaz → updates `profiles.theme` + next-themes.
- **Şifre değiştir**: current, new (≥ 8), repeat → re-auth with current password then
  `auth.updateUser`.
- **Çıkış yap**.

## S7 · Bildirimler — `/[branch]/bildirimler`

- List newest first (title 14/600, body 13 muted, relative time "2 sa önce"), unread dot; tap →
  mark read + navigate to `link`. Button *Tümünü okundu say*. Empty: "Bildirim yok".
- Bell badge updates via Realtime.

## S8 · Patron home — `/[branch]` · mockup `Patron`

- Data: see ARCHITECTURE §3 (manager home).
- Header: "PIZZADAM DE PIJP" overline + date; admin: branch select.
- **AlertStrip** rows (only non-zero, in this order):
  1. bad · "Bitirilmemiş kayıt" — open entries whose work_date < today → Onay of that day
  2. warn · "{n} kayıt onay bekliyor" — pending entries (sub: day, "x düzenlendi, y bitirilmedi")
  3. info · "Yeni talep" — pending leave → Talepler (manager)
  4. info · "Gün değişikliği yapıldı" — accepted swaps not seen → Talepler
  5. warn · "Program taslağı onay bekliyor" — draft week → Program
  6. info · "Talepler {gün} kapanıyor · {n}/{m} yanıt" — collecting week, deadline within 3 days
  7. bad · "{Gün tarih} eksik personel" — next 7 days below minimum (published or draft)
  Empty → "Bekleyen iş yok ✓".
- Stats: **{Ay} personel gideri** (approved; sub "x sa onaylı · n kayıt bekliyor"), **Dünkü gider**,
  **Bugün** "mesaide / planlı".
- **Bu hafta**: 7-column strip with "n/min" per day (red if short), today accent; link *Gelecek
  hafta* → Program.
- **Bugün çalışanlar**: planned people + anyone clocked in: avatar, name, "16:55'ten beri · 2 sa
  15 dk" or "Planlı · henüz başlamadı" (warn chip "Bekleniyor") or "Bitti 23:10" (muted).

## S9 · Gün sonu onayı — `/[branch]/onay?gun=YYYY-MM-DD` · mockup `Onay`

- Default day: the most recent day with pending/open entries, else yesterday.
- Day switcher ‹ › (no future). Summary: Onaylanan x / n, Toplam saat, Gider (+ note "Toplamlara
  bitirilmemiş kayıt dahil değil. Süreler 5 dakikaya yuvarlandı.").
- **ApprovalCard** per entry (sorted by start): open → red border, time input for end + *Kaydet*;
  pending → *Düzenle* (sheet: start/end) and *Onayla*; approved → chip Onaylandı, *Düzenle* still
  available, *Onayı kaldır* in the sheet. Edited → warn line with the original start/end from audit.
  Sheet also has *Kaydı sil* (confirm dialog).
- *+ Kayıt ekle* (sheet: person select (branch members), start, end).
- Sticky bottom: **Kalan {n} kaydı onayla** (`approve_entries`) / "Tümü onaylandı".

## S10 · Program — `/[branch]/program?hafta=YYYY-MM-DD` · mockup `Program`

- Week tabs: this week, next, +2 (status chip each).
- *collecting*: deadline, list of employees with answer state (Şablonu onayladı / Değişiklik
  istedi (days) / Yanıt yok), *Talepleri şimdi kapat* (confirm) → `close_week_now`.
- *draft*: summary card (onayladı / değişiklik / yanıtsız counts), legend, **DayRow** per day with
  removable chips (tap chip → small menu "Bu günden çıkar") and *+ Kişi ekle* (sheet: members not on
  that day; those who requested the day first, with "istedi" tag; leave → disabled "İzinli").
  Sticky bottom: warning line + **Programı yayınla ve kilitle** (confirm) → `publish_week`.
- *locked*: same board, editable (each change notifies the person), section **Gün değişiklikleri**
  (accepted swaps: "Elif → Murat · Salı 27 Ekim", *Geri al*), status chip Kilitli.

## S11 · Talepler (manager inbox) — `/[branch]/talepler`

- **İzin talepleri**: pending first (name, type, range, note, days of overlap with schedule) →
  *Onayla* / *Reddet* (optional note). History (last 30 days).
- **Gün değişiklikleri**: accepted swaps (unseen highlighted; opening marks seen) → *Geri al*;
  pending swaps (read-only).

## S12 · Çalışanlar — `/[branch]/calisanlar`

- Search box; list: avatar, name, username, rate, branches chips, status (Aktif/Pasif), this
  month's hours → tap profile. Filter Aktif/Pasif. Button **+ Yeni çalışan** → S14.

## S13 · Çalışan profili — `/[branch]/calisanlar/[id]` · mockup `Calisan`

- Identity (name, username, start date, branch chips, status).
- Month summary for **this branch** (month picker): toplam saat, hesaplanan, avans, ödenen, kalan.
- **Saatlik ücret** card: current rate + since; *Ücreti değiştir* (inline: amount, effective date
  default 1st of next month; past dates allowed with a confirm "Geçmiş kayıtların tutarı
  değişecek") ; history list.
- **Ödemeler ve avanslar**: list for the month with **Görünür/Gizli** switch each; *+ Ekle* sheet
  (tür, tutar, tarih, ay, not, görünür switch); delete in row menu.
- **Son kayıtlar** (10) → link to Onay of that day.
- **Hesap**: *Şifreyi sıfırla* (dialog: new temporary password, show once, copy button),
  *Hesabı pasife al* / *Aktifleştir* (confirm). Admin only: branch membership editor.

## S14 · Yeni çalışan — `/[branch]/calisanlar/yeni`

- Fields: Ad soyad, Kullanıcı adı (auto-suggest from name: lowercase, Turkish chars → ascii, dot),
  Geçici şifre (generate button), Saatlik ücret, Başlangıç tarihi, Şubeler (admin: checkboxes;
  patron: own, fixed).
- Submit → `createEmployee` → success screen with the login link `…/<slug>/giris`, username and
  the temporary password (copy all as text for WhatsApp).
- Errors: username taken → "Bu kullanıcı adı alınmış."

## S15 · Raporlar — `/[branch]/raporlar?ay=YYYY-MM` · mockup `Raporlar`

- Selects: Ay (last 12 months), Şube (admin: each + "Tüm şubeler"; patron: fixed).
- Summary: approved cost (30/700), hours · people · date range; **DailyBars** (approved/pending).
- **Kişi bazlı döküm** (sorted by hours desc): name, "x sa · €hesaplanan · avans €…", kalan right;
  totals row. Tap → profile.
- Sticky bottom: **Excel** / **PDF** → `GET /api/export?...` (download; button shows spinner).

## S16 · Ayarlar — `/[branch]/ayarlar` · mockup `Ayarlar`

- Haftalık talep kapanışı (gün select, saat), explanation line.
- Minimum personel (7 steppers).
- Çalışan hesapları (counts, *+ Yeni çalışan*).
- Şube bilgisi (address, opening hours text, login URL + *Kopyala*, cutoff note).
- Görünüm (theme, personal).
- Sticky **Değişiklikleri kaydet** (enabled only when dirty) → "Kaydedildi ✓" toast.
