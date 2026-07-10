# CLAUDE.md — Tenderlist

Afrika-öncelikli global ihale (tender) keşif SaaS'ı. Çekirdek döngü:
**kaydol → 3 dakikada alarm kur → işe yarar e-posta al → orijinal kaynağa tıkla.**

## ⚠️ Önce oku
- **Yol haritası + faz durumu:** [`docs/ROADMAP.md`](./docs/ROADMAP.md) — tek doğruluk kaynağı. Bir işe başlamadan buraya bak; faz/kurulum adımı bitince güncelle.
- **Servis kurulum rehberi (hesaplar, anahtarlar):** [`docs/KURULUM.md`](./docs/KURULUM.md).
- **Gizli anahtarlar sadece** `.env` ve `apps/web/.env.local`'e girer — asla git'e commit'lenmez.

## Stack
Next.js 15 App Router (TS strict) · Tailwind v4 · shadcn/ui · PostgreSQL (Supabase) + Drizzle ·
Meilisearch · BullMQ + Redis (Upstash) · Clerk (auth) · Paddle (ödeme) · Resend (e-posta) ·
next-intl (en varsayılan `/`, tr `/tr`) · Anthropic (AI özet/extraction) · PostHog + Sentry.
Deploy: Vercel (web) + Railway (worker).

## Dizin haritası
```
apps/web        Next.js uygulaması (App Router, [locale] segmenti)
apps/worker     BullMQ worker'ları (normalize, alert, email-dispatch, index-sync, ...)
packages/config entitlements, pricing, quota, queue adları, search ayarları (@repo/config)
packages/db     Drizzle şema + migrations + seed (@repo/db)
packages/emails React Email şablonları (@repo/emails)
```
Python scraper ayrı repoda; buradan tek temas noktası `POST /api/ingest` sözleşmesidir.

## Komutlar
```
pnpm dev            # tüm workspace (turbo)
pnpm lint && pnpm typecheck && pnpm test   # CI ile aynı; commit öncesi çalıştır
pnpm db:migrate     # DIRECT_URL (5432) ile migration
pnpm db:seed        # 200 sahte ihale
cd apps/worker && pnpm exec tsx src/scripts/meili-setup.ts --reindex   # Meili ayar + reindex
```
Lokal dev stack (brew): postgres@17 :5433 · redis :6379 · meilisearch :7700 — detay KURULUM.md.

## Konvansiyonlar
- Kod, yorum ve commit mesajları **İngilizce**; kullanıcıyla iletişim Türkçe.
- Entitlement/plan mantığı tek kaynak: `packages/config/src/entitlements.ts`. Yeni gate eklerken oradan oku.
- Public sayfalar ISR; tüm `/search` param'ları noindex. Tender'larda **asla** JobPosting schema'sı kullanma.
