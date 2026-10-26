# Pizzadam Şube ERP

De Pijp ve Zuid şubeleri için gizli, mobil öncelikli personel uygulaması:
mesai (Başla/Bitir), gün sonu onayı, saatlik ücret ve kazanç, haftalık program (şablon → talep →
taslak → yayın), gün devri, izin/tatil, ödeme/avans, raporlar ve Excel/PDF.

Bu klasör **uygulamanın kodu değil, Claude Code'un uygulamayı yazması için hazırlanmış tam
pakettir**: şartname, ekran tasarımları, test edilmiş veritabanı şeması, adım adım yol haritası.

## İçindekiler

| Dosya | Ne işe yarar |
| --- | --- |
| `CLAUDE.md` | Claude Code her oturumda bunu okur: kurallar, komutlar, terimler |
| `docs/SPEC.md` | Fonksiyonel şartname — tüm kurallar ve uç durumlar |
| `docs/SCREENS.md` | 16 ekranın tek tek tanımı (veri, bölümler, aksiyonlar, metinler) |
| `docs/DESIGN.md` + `docs/mockups/` | Renk/tipografi token'ları, bileşenler, 11 ekran taslağı |
| `docs/ARCHITECTURE.md` | Teknoloji, klasör yapısı, yetkilendirme, ortam değişkenleri |
| `docs/ROADMAP.md` | 12 aşamalı geliştirme planı + her aşama için hazır prompt |
| `docs/TEST-PLAN.md` | Veritabanı, birim, uçtan uca ve erişilebilirlik testleri |
| `docs/DECISIONS.md` | Alınan kararlar ve nedenleri |
| `supabase/migrations/` | Tablolar, RLS, tetikleyiciler, program motoru, RPC'ler, cron |
| `supabase/tests/` | Postgres'te çalışan duman + yetki testleri (13 senaryo, geçiyor) |
| `scripts/` | Kullanıcı oluşturma ve yerel test verisi betikleri |
| `.github/workflows/` | CI (şema testleri, lint, test) ve gece yedeği |

## Nasıl başlarsın

1. GitHub'da özel bir repo aç (`pizzadam-erp`), bu klasörün içeriğini kopyala, commit et.
2. Bilgisayarında: Node.js LTS, Docker Desktop, Supabase CLI kurulu olsun.
3. Supabase'de **Frankfurt** bölgesinde proje aç; Authentication'da kayıt olmayı ve e-posta
   doğrulamayı kapat.
4. Repo klasöründe terminali aç, `claude` yaz.
5. `docs/ROADMAP.md` → **Phase 0** prompt'unu yapıştır. Her aşama bitince testler yeşil mi bak,
   kabul kriterlerini işaretle, sonraki aşamaya geç.

Şema testi (Docker gerekmez, düz Postgres yeterli): `supabase/tests/run-local.sh`

## Bilmen gerekenler

- **Vercel Hobby (ücretsiz) plan ticari olmayan kişisel kullanım içindir.** Pizzacının iç sistemi
  ticari kullanım sayılır; canlıda **Vercel Pro** kullan. Geliştirme ve deneme için Hobby yeterli.
- Supabase ücretsiz projeleri **7 gün düşük aktivitede duraklatılır**; günlük kullanımda sorun
  olmaz. Maaş verisi olduğu için gece yedeği (`backup.yml`) açık olsun.
- Çalışanların e-postası yok: hesaplar `kullaniciadi@staff.pizzadam.invalid` ile açılır, kimseye
  mail gitmez. Phase 2'de Supabase'in bu adresi kabul ettiği doğrulanacak.
- Yaz/kış saati gecelerinde süre gerçek çalışılan süredir (Ekim'de +1 saat, Mart'ta −1 saat).
- Marka rengi şimdilik domates kırmızısı; Pizzadam'ın kesin renk kodu gelince `DESIGN.md`'de
  `--accent` değişir.
