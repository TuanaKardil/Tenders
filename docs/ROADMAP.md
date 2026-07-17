# Tenderlist — Yol Haritası (tek doğruluk kaynağı)

> Bu dosya, sohbet kapansa bile planın kaybolmaması için repoda tutulur.
> **Her faz / kurulum adımı bitince buradaki durumu güncelle.**
> Adım-adım hesap kurulum rehberi: [`docs/KURULUM.md`](./KURULUM.md).

Ürün: Afrika-öncelikli global ihale keşif SaaS'ı. Çekirdek döngü:
kaydol → 3 dakikada alarm kur → işe yarar e-posta al → orijinal kaynağa tıkla.

Stack: Next.js 15 (App Router, TS strict) · Tailwind v4 · shadcn/ui · PostgreSQL (Supabase) +
Drizzle · Meilisearch · BullMQ + Redis (Upstash) · Clerk · Paddle · Resend · next-intl (en/tr) ·
Anthropic · PostHog + Sentry · Vercel (web) + Railway (worker).

---

## Faz durumu

| Faz | İçerik | Durum |
|-----|--------|-------|
| **0** | Monorepo, Next.js/TS/Tailwind/shadcn, BullMQ worker, Drizzle şema, CI (lint+typecheck+test) | ✅ commit'li |
| **1a** | `api/ingest`, normalize worker, admin sources/runs, seed (200 sahte ihale), migration `0000` | ✅ commit'li |
| **1b** | `/search` (Meili+facet), `/tenders/[slug]`, `/go/[id]` izlenen yönlendirme, `/map`, landing | ✅ commit'li |
| **1c** | `/onboarding`, saved-searches, alert motoru (instant/daily/weekly), digest e-posta, `/dashboard`, `/watchlist`+ICS | ✅ commit'li |
| **Kurulum** | Servisleri gerçek hesaplarla bağla, mevcut özellikleri uçtan uca doğrula | 🔧 **devam ediyor** (aşağıda) |
| **1d** | Gelir: `/pricing`, Paddle checkout+webhook, Redis metered kotalar, quota-hit/trial e-posta | ✅ kod (Paddle hesabı + env bekliyor) |
| **1e** | Cila/launch: SEO (sitemap/robots/hreflang/JSON-LD/OG), Sentry+PostHog, legal, `/countries`·`/sectors`·`/blog`, not-found/error | ⏳ |

Hazır ama henüz bağlanmamış altyapı: entitlements config (free/starter/pro tüm kotalar,
`packages/config/src/entitlements.ts`), `subscriptions` tablosu Paddle kolonlarıyla
(`packages/db/src/schema/users.ts`), `planFor()`/`entitlementsForUser()`
(`apps/web/src/server/plan.ts`). Watchlist + alert limitleri DB-say ile *uygulanıyor*; metered
kotalar (searches/day, detail views/mo, source clicks/mo) **henüz uygulanmıyor** → Faz 1d.

---

## Kurulum checklist (öncelikli — gerçek hesaplar)

Detay + doğrulama komutları [`docs/KURULUM.md`](./KURULUM.md)'de. Gizli anahtarlar **sadece**
`.env` / `apps/web/.env.local`'e (git'e girmez).

- [x] **Supabase** — DATABASE_URL/DIRECT_URL girili (şifre var)
- [x] **Supabase** — bağlantı doğrulandı; migrate uygulandı; seed çalıştı (377 sahte ihale, 225 yayında — bilinçli olarak korundu)
- [x] **Upstash Redis** — `REDIS_URL` bağlı; worker ayağa kalkıyor, 5 schedule kayıtlı
  - ⚠️ **Upstash ücretsiz kotası (500K komut/ay) tükendi** — BullMQ + zamanlanmış görevler Redis'i sürekli yoklar; dev'de sürekli açık worker kotayı hızla yer. Seçenekler: (a) dev için lokal Redis (`redis-server`) kullan, Upstash'ı sadece deploy'a sakla — orijinal tasarım buydu; (b) Upstash'ı pay-as-you-go'ya yükselt; (c) aylık sıfırlanmayı bekle. Arama/gezinme etkilenmez (Meili); sadece kuyruk/kota Redis'e bağlı.
- [x] **Meilisearch Cloud** — host+key'ler bağlı; reindex yapıldı (225 doc); `/search` gerçek veriyle HTTP 200
- [x] **Clerk** — `pk_/sk_` bağlı (web-only); webhook yerine `getCurrentUser` lazy-provision eklendi (lokal için)
- [ ] **Anthropic** — `ANTHROPIC_API_KEY` → AI özet/extraction (🟡 sonra, seed özetleri hazır)
- [ ] **Resend** — `RESEND_API_KEY` + `EMAIL_FROM` → alarm e-postaları (🟡 sonra, dev'de log)
- [x] **Uçtan uca smoke (tarayıcı)** — landing/search/detay/map/dashboard gerçek veriyle çalışıyor; Clerk oturumu + kayıtlı arama + lazy-provision doğrulandı. Kalan: gerçek e-posta gönderimi (Resend) test edilmedi.

**Konumlandırma:** Ürün Afrika'ya özgü değil — **global**; Afrika sadece şimdiki seed kaynakları. Landing/i18n/map metinleri "Afrika" → "global/dünya" olarak güncellendi.

**AI sağlayıcı:** Anthropic yerine **OpenRouter** (OpenAI-uyumlu). `.env`: `OPENROUTER_API_KEY` + `OPENROUTER_MODEL=google/gemini-2.5-flash` (bulk çeviri/özet/çıkarım workhorse'u; düşük-güven kayıtlar için daha güçlü modele yükseltilebilir). **AI worker'ı henüz yazılmadı** (extract/translate-summarize kuyrukları boş) — TR aramanın çalışması buna bağlı.

**Deneme bulguları (iyileştirme):**
- ✅ 🗺️ Harita — `NEXT_PUBLIC_MAPTILER_KEY` eklendi; tile'lar, sınırlar ve balon→ülke paneli çalışıyor.
- 🌐 TR arama/alarm 0 döner → seed ihaleleri İngilizce (title_tr/summary_tr boş); AI worker (OpenRouter) çeviriyi üretince düzelir.
- 🏠 Landing'de brief'teki fiyat teaser'ı / harita teaser'ı / FAQ yok → Faz 1e.
- 📄 İhale detayında "Alarm kur" ve "Paylaş" butonları yok (brief'te var) → küçük ekleme.
- ⚠️ Next dev "1 Issue" göstergesi (runtime hatası yok, console temiz) → launch öncesi temizlenmeli.

**Kod desteği (bu turda eklendi):** worker `pnpm dev` artık `--env-file=../../.env` ile kök `.env` okuyor; `getCurrentUser` (`apps/web/src/server/auth.ts`) kullanıcıyı ilk girişte oluşturuyor.

Sonraya (fazlarla gelir): MapTiler (harita tile), Paddle (1d), PostHog + Sentry (1e).

---

## Faz 1d — Gelir (kod ✅ bitti, aktivasyon kullanıcı kararıyla ertelendi)

> ⏸️ **Ödeme aktivasyonu şimdilik park edildi (kullanıcı kararı).** Kod uykuda: checkout "not configured", webhook "not configured" döner — maliyet/yan etki yok. Sağlayıcı kararı: **Paddle** (MoR, global, düşük-fiyatlı B2B için taksit avantajı zayıf olduğundan iyzico şimdilik gereksiz; Stripe TR merkezli tüzel kişilikte açılamaz). iyzico ancak TR ana düşük-fiyatlı kanal olursa eklenecek — mimari (`subscriptions` + `planFor`) sağlayıcı-bağımsız, ekleme = 1 webhook + 1 checkout.

Kod tamam ve doğrulandı (typecheck/lint/test yeşil, sayfalar tarayıcıda gezildi). **Aktive olması için Paddle sandbox kurulumu gerekli** (KURULUM.md Faz 1d): sandbox hesabı → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_ENV`; Catalog'da Starter/Pro ürünleri → 4 price ID (`NEXT_PUBLIC_PADDLE_PRICE_*`); deploy sonrası webhook → `/api/webhooks/paddle`. Env gelince checkout butonları ve abonelik→plan akışı otomatik çalışır.

Yapılanlar:

- Yeni dep: `@paddle/paddle-node-sdk`, `@paddle/paddle-js`.
- `packages/config/src/pricing.ts` — Starter $19/ay·$190/yıl, Pro $59/ay·$590/yıl; 4 price ID env'den.
- `packages/config/src/quota.ts` + `apps/web/src/server/quota.ts` — Redis `INCR`+TTL sayaçları (`q:search:{uid}:{gün}`, `q:detail`/`q:click:{uid}:{ay}`).
- `apps/web/src/app/[locale]/pricing/page.tsx` — 3 plan + karşılaştırma + aylık/yıllık + Paddle overlay. Yeni i18n `pricing`.
- `apps/web/src/app/api/webhooks/paddle/route.ts` — imza doğrula → `subscriptions` upsert.
- Kota gate'leri: ✅ `/go/[tenderId]` (click), ✅ `/search` (searchesPerDay + archiveDays). ⏸️ `/tenders/[slug]` (detailViews) **bilinçli ertelendi** — per-user gate detay sayfasını dinamikleştirip ISR/SEO'yu bozardı; sonra soft/client-side sayaçla ele alınacak.
- Entitlement uygulaması: `aiSummaries`, `csvExport` (Pro), `eligibilityAi` (Pro).
- `<UpgradePrompt>` + `/pricing` CTA'ları.
- E-posta: `quota-hit.tsx` + `trial-payment-issue.tsx` template + email-dispatch renderer.
- Test: `quota.test.ts`, Paddle webhook unit testi, `entitlements.test.ts` genişletme.

## Faz 1e — Cila/launch (kod, devam ediyor)

- ✅ **SEO:** `sitemap.ts` (statik + yayında tenders), `robots.ts`, `metadataBase` + hreflang/canonical, JSON-LD (Organization/WebSite+SearchAction landing, BreadcrumbList detay — **JobPosting yok**). Tarayıcıda doğrulandı.
- ✅ **OG:** site geneli varsayılan + `tenders/[slug]/opengraph-image.tsx` (`next/og`); intl middleware'den hariç tutuldu. Görsel doğrulandı.
- ✅ **Legal + footer:** `/terms`, `/privacy`, `/takedown` (taslak içerik, açıkça işaretli) + keşif için footer.
- ✅ **Boş/hata:** `[locale]/not-found.tsx`, `error.tsx`, kök `global-error.tsx` (i18n) + dashboard/watchlist/alerts/detay `loading.tsx` iskeletleri.
- ✅ **Programatik SEO:** `/countries/[country]` + `/sectors/[sector]` (dinamik stat + liste + FAQPage schema). **`NEXT_PUBLIC_SEO_LIVE` bayrağıyla korumalı** — varsayılan kapalı; seed/örnek veri indekslenmez ve sitemap'e girmez. Gerçek veri gelince `true` yap.
- ✅ **Gözlemlenebilirlik:** Sentry (web instrumentation + worker) + PostHog provider — hepsi env-gated (DSN/key gelince aktive olur, şimdi uykuda).
- ✅ **Blog:** `/blog` + `/blog/[slug]` iskelet (veri-tabanlı, Article schema, noindex; sonra MDX/CMS'e çevrilir).
- ✅ **Playwright smoke:** landing/search/detay/pricing halka açık yol (`pnpm --filter web test:e2e`). Auth-gated akışlar (Clerk test user) → takip görevi.
- ⏳ **Lighthouse:** deploy sonrası prod build'e karşı çalıştır (dev puanı yanıltıcı); hedef mobil >85.

## Gerçek veri / scraper'lar (başladı — Tem 2026)

Sahte seed silindi. Scraper'lar **repo içinde TS adapter** olarak (`apps/worker/src/scrapers/`),
`backfill.ts` ile çalışıyor (şimdilik Redis kuyruğunu bypass eden doğrudan yükleme, çünkü
Upstash kotası dolu). Kural: **sadece açık VE son ~7 günde yayınlanmış** ihaleler (veri taze/az).

| Kaynak | Slug | Tip | Durum |
|--------|------|-----|-------|
| TED (AB) | `ted-eu` | Resmi REST API | ✅ canlı (~44) |
| Uganda eGP | `ug-egp` | Server-render HTML (cheerio) | ✅ canlı (~5) |
| UNGM | `ungm` | Arama POST → HTML satır (cheerio) | ✅ canlı (~14) |
| Kenya PPIP | `ke-ppip` | Gizli JSON API `/api/active-tenders` | ✅ canlı (~148) |
| Etiyopya eGP | `et-egp` | Gizli JSON API `cms-v2/get-grouped-sourcing` | ✅ canlı (~50) |

**5/5 kaynak canlı** — ~261 gerçek açık ihale (son 7 gün, gelecek-tarihli elenir). SPA'ların
(Kenya/Etiyopya) arka API'leri bulundu, headless gerekmedi. Kural: `apps/worker/src/scrapers/shared.ts`
`isRecentAndOpen` (açık + son 7 gün + gelecek değil, gün-sonu toleranslı).

**Sonraki büyük iş — belge çıkarımı:** İhale bilgisi çoğu zaman ekli **PDF/Word/görselin
içinde**. Gerekli: PDF metin çıkarımı + görsel için **OCR** → AI (OpenRouter) ile yapılandırılmış
alanlara. Bu, AI worker fazının parçası.

**Açık işler:** EU ülke centroid'leri (globe haritasında AB baloncukları için) · düzenli
scraping için worker+Redis zamanlaması (deploy'da) · `sourceUrl` http/https doğrulaması.

---

## Harita geliştirme yolu (araştırıldı — Tem 2026)

Mevcut: MapLibre v5 **globe projeksiyonu** (koyu stil, parlayan mavi baloncuklar, boşta
otomatik dönüş). Sıradaki adaylar (etki/efor sırasıyla):
1. **Choropleth** — ülkeleri ihale yoğunluğuna göre mavi tonlarıyla boya (skill önerisi;
   ülke sınırları GeoJSON + fill layer; lejant şart).
2. **Ülkeye tıkla → fly-to + yakınlaş** — baloncuğa tıklayınca küre o ülkeye dönsün.
3. **Sektör filtresi** — haritada sektöre göre baloncuk filtreleme.
4. **Değer ısı haritası** — value_usd_est ile heatmap katmanı (gerçek veri gelince anlamlı).
5. **Şehir seviyesi** — zoom > 4'te ülke baloncukları şehir noktalarına ayrışsın (gerçek
   koordinatlı veri gerektirir → ingestion sonrası).

## Açık kararlar (varsayılanla ilerlenebilir)

- Alan adı: `tenderlist.app` placeholder — karar verilince `EMAIL_FROM`/`NEXT_PUBLIC_APP_URL`/SEO güncellenir.
- Fiyat USD-only, aylık+yıllık. Paddle canlı onayı haftalar sürebilir → site yayına girer girmez başvur.
- AI özet/extraction worker'ının Anthropic'i gerçekten çağırdığı kurulumda teyit edilecek; eksikse 1d öncesi mini-görev.
