# Tenderlist — Roadmap (single source of truth)

> Kept in the repo so the plan survives even if the chat is closed.
> **Update the status here whenever a phase / setup step is done.**
> Step-by-step account setup guide: [`docs/SETUP.md`](./SETUP.md).

Product: Africa-first global tender discovery SaaS. Core loop:
sign up → set an alert in 3 minutes → get a useful email → click through to the original source.

Stack: Next.js 15 (App Router, TS strict) · Tailwind v4 · shadcn/ui · PostgreSQL (Supabase) +
Drizzle · Meilisearch · BullMQ + Redis (Upstash) · Clerk · Paddle · Resend · next-intl (en/tr) ·
Anthropic · PostHog + Sentry · Vercel (web) + Railway (worker).

---

## Phase status

| Phase | Content | Status |
|-------|---------|--------|
| **0** | Monorepo, Next.js/TS/Tailwind/shadcn, BullMQ worker, Drizzle schema, CI (lint+typecheck+test) | ✅ committed |
| **1a** | `api/ingest`, normalize worker, admin sources/runs, seed (200 fake tenders), migration `0000` | ✅ committed |
| **1b** | `/search` (Meili+facets), `/tenders/[slug]`, `/go/[id]` tracked redirect, `/map`, landing | ✅ committed |
| **1c** | `/onboarding`, saved-searches, alert engine (instant/daily/weekly), digest email, `/dashboard`, `/watchlist`+ICS | ✅ committed |
| **Setup** | Wire services to real accounts, verify existing features end-to-end | 🔧 **in progress** (below) |
| **1d** | Revenue: `/pricing`, Paddle checkout+webhook, Redis metered quotas, quota-hit/trial email | ✅ code (awaiting Paddle account + env) |
| **1e** | Polish/launch: SEO (sitemap/robots/hreflang/JSON-LD/OG), Sentry+PostHog, legal, `/countries`·`/sectors`·`/blog`, not-found/error | ⏳ |

Ready but not yet wired: entitlements config (free/starter/pro with all quotas,
`packages/config/src/entitlements.ts`), `subscriptions` table with Paddle columns
(`packages/db/src/schema/users.ts`), `planFor()`/`entitlementsForUser()`
(`apps/web/src/server/plan.ts`). Watchlist + alert limits are *enforced* via DB counts; metered
quotas (searches/day, detail views/mo, source clicks/mo) are **not enforced yet** → Phase 1d.

---

## Setup checklist (priority — real accounts)

Details + verification commands in [`docs/SETUP.md`](./SETUP.md). Secret keys go **only** in
`.env` / `apps/web/.env.local` (never committed).

- [x] **Supabase** — DATABASE_URL/DIRECT_URL filled in (password set)
- [x] **Supabase** — connection verified; migrate applied; seed ran (377 fake tenders, 225 published — kept on purpose)
- [x] **Upstash Redis** — `REDIS_URL` connected; worker boots, 5 schedules registered
  - ⚠️ **Upstash free quota (500K commands/month) exhausted** — BullMQ + scheduled jobs poll Redis constantly; a worker left running in dev burns the quota fast. Options: (a) use local Redis (`redis-server`) for dev and keep Upstash for deploy only — the original design; (b) upgrade Upstash to pay-as-you-go; (c) wait for the monthly reset. Search/browsing is unaffected (Meili); only queues/quotas depend on Redis.
- [x] **Meilisearch Cloud** — host+keys connected; reindexed (225 docs); `/search` returns HTTP 200 with real data
- [x] **Clerk** — `pk_/sk_` connected (web-only); instead of the webhook, `getCurrentUser` lazy-provision added (for local)
- [ ] **Anthropic** — `ANTHROPIC_API_KEY` → AI summary/extraction (🟡 later, seed summaries ready)
- [ ] **Resend** — `RESEND_API_KEY` + `EMAIL_FROM` → alert emails (🟡 later, logged in dev)
- [x] **End-to-end smoke (browser)** — landing/search/detail/map/dashboard work with real data; Clerk session + saved search + lazy-provision verified. Remaining: real email sending (Resend) not tested.

**Positioning:** The product is not Africa-specific — it's **global**; Africa is just the current seed sources. Landing/i18n/map copy updated from "Africa" → "global/world".

**AI provider:** **OpenRouter** instead of Anthropic (OpenAI-compatible). `.env`: `OPENROUTER_API_KEY` + `OPENROUTER_MODEL=google/gemini-2.5-flash`. **Translate + summarize done** (`apps/worker/src/scripts/translate-summarize.ts`, gemini-2.5-flash-lite): all ~254 live tenders now have `title_en/tr` + `summary_en/tr`, Meili reindexed, **TR search works**. Still 🔴: extraction, classification, OCR/PDF, dedup, and wiring these as BullMQ workers.

**Trial findings (improvements):**
- ✅ 🗺️ Map — `NEXT_PUBLIC_MAPTILER_KEY` added; tiles, borders and bubble→country panel work.
- 🌐 TR search/alerts return 0 → seed tenders are English (title_tr/summary_tr empty); fixed once the AI worker (OpenRouter) produces translations.
- 🏠 Landing lacks the brief's pricing teaser / map teaser / FAQ → Phase 1e.
- 📄 Tender detail lacks "Set alert" and "Share" buttons (in the brief) → small addition.
- ⚠️ Next dev "1 Issue" indicator (no runtime error, console clean) → clean up before launch.

**Code support (added this session):** worker `pnpm dev` now reads the root `.env` via `--env-file=../../.env`; `getCurrentUser` (`apps/web/src/server/auth.ts`) creates the user on first sign-in.

Later (comes with the phases): MapTiler (map tiles), Paddle (1d), PostHog + Sentry (1e).

---

## Phase 1d — Revenue (code ✅ done, activation deferred by user decision)

> ⏸️ **Payment activation is parked for now (user decision).** Code is dormant: checkout returns "not configured", webhook returns "not configured" — no cost/side effects. Provider decision: **Paddle** (MoR, global; iyzico unnecessary for now since its installment advantage is weak for low-ticket B2B; Stripe can't be opened with a Turkey-based legal entity). iyzico only if TR becomes the main low-ticket channel — the architecture (`subscriptions` + `planFor`) is provider-agnostic; adding it = 1 webhook + 1 checkout.

Code is complete and verified (typecheck/lint/test green, pages browsed). **To activate, Paddle sandbox setup is needed** (SETUP.md Phase 1d): sandbox account → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_ENV`; Starter/Pro products in the Catalog → 4 price IDs (`NEXT_PUBLIC_PADDLE_PRICE_*`); after deploy, webhook → `/api/webhooks/paddle`. Once env is set, checkout buttons and the subscription→plan flow work automatically.

Done:

- New deps: `@paddle/paddle-node-sdk`, `@paddle/paddle-js`.
- `packages/config/src/pricing.ts` — Starter $19/mo·$190/yr, Pro $59/mo·$590/yr; 4 price IDs from env.
- `packages/config/src/quota.ts` + `apps/web/src/server/quota.ts` — Redis `INCR`+TTL counters (`q:search:{uid}:{day}`, `q:detail`/`q:click:{uid}:{month}`).
- `apps/web/src/app/[locale]/pricing/page.tsx` — 3 plans + comparison + monthly/annual + Paddle overlay. New i18n `pricing`.
- `apps/web/src/app/api/webhooks/paddle/route.ts` — verify signature → `subscriptions` upsert.
- Quota gates: ✅ `/go/[tenderId]` (click), ✅ `/search` (searchesPerDay + archiveDays). ⏸️ `/tenders/[slug]` (detailViews) **deferred on purpose** — a per-user gate would make the detail page dynamic and break ISR/SEO; to be handled later with a soft/client-side counter.
- Entitlement enforcement: `aiSummaries`, `csvExport` (Pro), `eligibilityAi` (Pro).
- `<UpgradePrompt>` + `/pricing` CTAs.
- Email: `quota-hit.tsx` + `trial-payment-issue.tsx` templates + email-dispatch renderer.
- Tests: `quota.test.ts`, Paddle webhook unit test, `entitlements.test.ts` extension.

## Phase 1e — Polish/launch (code, in progress)

- ✅ **SEO:** `sitemap.ts` (static + published tenders), `robots.ts`, `metadataBase` + hreflang/canonical, JSON-LD (Organization/WebSite+SearchAction on landing, BreadcrumbList on detail — **no JobPosting**). Verified in the browser.
- ✅ **OG:** site-wide default + `tenders/[slug]/opengraph-image.tsx` (`next/og`); excluded from the intl middleware. Image verified.
- ✅ **Legal + footer:** `/terms`, `/privacy`, `/takedown` (draft content, clearly marked) + a footer for discovery.
- ✅ **Empty/error:** `[locale]/not-found.tsx`, `error.tsx`, root `global-error.tsx` (i18n) + dashboard/watchlist/alerts/detail `loading.tsx` skeletons.
- ✅ **Programmatic SEO:** `/countries/[country]` + `/sectors/[sector]` (dynamic stats + list + FAQPage schema). **Guarded by the `NEXT_PUBLIC_SEO_LIVE` flag** — off by default; seed/sample data is not indexed and stays out of the sitemap. Set `true` once real data is live.
- ✅ **Observability:** Sentry (web instrumentation + worker) + PostHog provider — all env-gated (activate once DSN/key is set, dormant now).
- ✅ **Blog:** `/blog` + `/blog/[slug]` skeleton (data-driven, Article schema, noindex; later swap to MDX/CMS).
- ✅ **Playwright smoke:** landing/search/detail/pricing public path (`pnpm --filter web test:e2e`). Auth-gated flows (Clerk test user) → follow-up.
- ⏳ **Lighthouse:** run against a prod build after deploy (dev scores are misleading); target mobile >85.

## Real data / scrapers (started — Jul 2026)

Fake seed deleted. Scrapers run as **in-repo TS adapters** (`apps/worker/src/scrapers/`) via
`backfill.ts` (for now a direct load bypassing the Redis queue, because the Upstash quota is
exhausted). Rule: **only open AND published in the last ~7 days** (data stays fresh/small).

| Source | Slug | Type | Status |
|--------|------|------|--------|
| TED (EU) | `ted-eu` | Official REST API | ✅ live (~44) |
| Uganda eGP | `ug-egp` | Server-rendered HTML (cheerio) | ✅ live (~5) |
| UNGM | `ungm` | Search POST → HTML rows (cheerio) | ✅ live (~14) |
| Kenya PPIP | `ke-ppip` | Hidden JSON API `/api/active-tenders` | ✅ live (~148) |
| Ethiopia eGP | `et-egp` | Hidden JSON API `cms-v2/get-grouped-sourcing` | ✅ live (~50) |

**5/5 sources live** — ~261 real open tenders (last 7 days, future-dated dropped). The SPAs'
(Kenya/Ethiopia) backend APIs were found, no headless needed. Rule: `apps/worker/src/scrapers/shared.ts`
`isRecentAndOpen` (open + last 7 days + not future, with end-of-day grace).

**Next big task — document extraction:** Tender info is often inside an attached **PDF/Word/image**.
Needed: PDF text extraction + **OCR** for images → structured fields via AI (OpenRouter). Part of
the AI worker phase.

**Open work:** EU country centroids (for EU bubbles on the globe map) · worker+Redis scheduling
for regular scraping (on deploy) · `sourceUrl` http/https validation.

---

## Map enhancement path (researched — Jul 2026)

Current: MapLibre v5 **globe projection** (dark style, glowing blue bubbles, idle
auto-rotation). Next candidates (by impact/effort):
1. **Choropleth** — shade countries by tender density in blues (skill suggestion;
   country borders GeoJSON + fill layer; legend required).
2. **Click a country → fly-to + zoom** — clicking a bubble rotates the globe to that country.
3. **Sector filter** — filter bubbles by sector on the map.
4. **Value heatmap** — a heatmap layer using value_usd_est (meaningful once real data is in).
5. **City level** — at zoom > 4, country bubbles split into city points (requires
   real coordinate data → post-ingestion).

## Open decisions (can proceed with defaults)

- Domain: `tenderlist.app` placeholder — once decided, update `EMAIL_FROM`/`NEXT_PUBLIC_APP_URL`/SEO.
- Pricing USD-only, monthly+annual. Paddle live approval can take weeks → apply as soon as the site is live.
- Whether the AI summary/extraction worker actually calls Anthropic to be confirmed at setup; if missing, a mini-task before 1d.
