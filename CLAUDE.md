# CLAUDE.md — Tenderlist

Africa-first global tender discovery SaaS. Core loop:
**sign up → set an alert in 3 minutes → get a useful email → click through to the original source.**

## ⚠️ Read first
- **Roadmap + phase status:** [`docs/ROADMAP.md`](./docs/ROADMAP.md) — single source of truth. Check it before starting any work; update it when a phase/setup step is done.
- **Service setup guide (accounts, keys):** [`docs/SETUP.md`](./docs/SETUP.md).
- **Secret keys go only** in `.env` and `apps/web/.env.local` — never committed to git.

## Stack
Next.js 15 App Router (TS strict) · Tailwind v4 · shadcn/ui · PostgreSQL (Supabase) + Drizzle ·
Meilisearch · BullMQ + Redis (Upstash) · Clerk (auth) · Paddle (payments) · Resend (email) ·
next-intl (en default `/`, tr `/tr`) · Anthropic (AI summary/extraction) · PostHog + Sentry.
Deploy: Vercel (web) + Railway (worker).

## Directory map
```
apps/web        Next.js app (App Router, [locale] segment)
apps/worker     BullMQ workers (normalize, alert, email-dispatch, index-sync, ...)
                └─ src/prompts/  ALL AI prompts live here, one file per task (see its README)
packages/config entitlements, pricing, quota, queue names, search settings (@repo/config)
packages/db     Drizzle schema + migrations + seed (@repo/db)
packages/emails React Email templates (@repo/emails)
```
The Python scraper lives in a separate repo; the only contact point here is the `POST /api/ingest` contract.

## Commands
```
pnpm dev            # whole workspace (turbo)
pnpm lint && pnpm typecheck && pnpm test   # same as CI; run before committing
pnpm db:migrate     # migration via DIRECT_URL (5432)
pnpm db:seed        # 200 fake tenders
cd apps/worker && pnpm exec tsx src/scripts/meili-setup.ts --reindex   # Meili settings + reindex
```
Local dev stack (brew): postgres@17 :5433 · redis :6379 · meilisearch :7700 — details in SETUP.md.

## Conventions
- Code, comments and commit messages in **English**; communication with the user in Turkish.
- Single source for entitlement/plan logic: `packages/config/src/entitlements.ts`. Read from there when adding a new gate.
- Public pages use ISR; all `/search` params are noindex. **Never** use JobPosting schema on tenders.
