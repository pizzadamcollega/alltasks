# Pizzadam Şube ERP

De Pijp ve Zuid şubeleri için gizli, mobil öncelikli personel uygulaması:
mesai (Başla/Bitir), gün sonu onayı, saatlik ücret ve kazanç, haftalık program (şablon → talep →
taslak → yayın), gün devri, izin/tatil, ödeme/avans, raporlar ve Excel/PDF.

**Durum (2026-10-27): kod yazıldı, canlıda.** Çalışan+yönetici ücret/mesai paneli (ROADMAP Phase
0–5) yazılı ve `https://alltasks-mauve.vercel.app` üzerinde — detay ve açık işler için önce
`CLAUDE.md`, sonra **`docs/PANEL-FEATURE-PLAN.md`**'e bak. Bu klasör artık sadece şartname değil,
gerçek Next.js uygulamasının kendisi.

## İçindekiler

| Dosya | Ne işe yarar |
| --- | --- |
| `CLAUDE.md` | Claude Code her oturumda bunu okur: kurallar, komutlar, terimler, **güncel durum** |
| `docs/PANEL-FEATURE-PLAN.md` | Neyin yapıldığı, canlı altyapı (Supabase/GitHub/Vercel), açık işler |
| `docs/SPEC.md` | Fonksiyonel şartname — tüm kurallar ve uç durumlar |
| `docs/SCREENS.md` | 16 ekranın tek tek tanımı (veri, bölümler, aksiyonlar, metinler) |
| `docs/DESIGN.md` + `docs/mockups/` | Renk/tipografi token'ları, bileşenler, 11 ekran taslağı |
| `docs/ARCHITECTURE.md` | Teknoloji, klasör yapısı, yetkilendirme, ortam değişkenleri |
| `docs/ROADMAP.md` | 12 aşamalı geliştirme planı — Phase 0–5 işaretli, 6–11 açık |
| `docs/TEST-PLAN.md` | Veritabanı, birim, uçtan uca ve erişilebilirlik testleri |
| `docs/DECISIONS.md` | Alınan kararlar ve nedenleri (D-01 .. D-30+) |
| `app/`, `components/`, `features/`, `lib/` | Uygulamanın kendisi (Next.js App Router) |
| `supabase/migrations/` | Tablolar, RLS, tetikleyiciler, program motoru, RPC'ler, cron |
| `supabase/tests/` | Postgres'te çalışan duman + yetki testleri (13 senaryo, geçiyor) |
| `scripts/` | Kullanıcı oluşturma ve yerel test verisi betikleri |
| `tests/unit/`, `tests/e2e/`, `tests/manual/` | Vitest (35 yeşil), Playwright (58 test, yazılı), görsel doğrulama script'leri |
| `.github/workflows/` | CI (şema testleri, lint, test) ve gece yedeği |

## Devam etmek için

1. `CLAUDE.md`'deki "Current status" bölümünü oku — en güncel bilgi orada.
2. Yerelde çalıştır: `npm install && npm run dev` (gerçek Supabase için `.env.local` zaten dolu).
3. `npm run lint && npm run typecheck && npm test && npm run build` — hepsi yeşil olmalı.
4. Docker'lı bir makinedeyse: `supabase start && npm run db:seed-users && npm run test:e2e` ve
   `npm run test:db` henüz hiç çalıştırılmadı (bu ortamda Docker yoktu) — ilk fırsatta koştur.
5. Sıradaki iş için `docs/ROADMAP.md` Phase 6'dan devam et, ya da `docs/PANEL-FEATURE-PLAN.md` §6
   "Known simplifications" listesindeki gerçek eksikleri kapat.

## Bilmen gerekenler

- **Vercel Hobby (ücretsiz) plan ticari olmayan kişisel kullanım içindir.** Pizzacının iç sistemi
  ticari kullanım sayılır; canlı trafikten önce **Vercel Pro**'ya geç. Şu an Hobby'de.
- Supabase ücretsiz projeleri **7 gün düşük aktivitede duraklatılır**; günlük kullanımda sorun
  olmaz. Maaş verisi olduğu için gece yedeği (`backup.yml`) açık olsun (`SUPABASE_DB_URL` secret'ı
  GitHub Actions'a eklenmeli — henüz eklenmedi).
- Çalışanların e-postası yok: hesaplar `kullaniciadi@staff.pizzadam.invalid` ile açılır, kimseye
  mail gitmez. **Doğrulandı** (D-28) — gerçek projede sorunsuz çalışıyor.
- Yaz/kış saati gecelerinde süre gerçek çalışılan süredir (Ekim'de +1 saat, Mart'ta −1 saat).
- Marka rengi logo'dan alındı (`#BE1E2D`, D-23) — artık placeholder değil.
