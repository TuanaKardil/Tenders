# Setup Instructions (for the founder)

All the services the code expects and where each key goes. Full list: `/.env.example`.
Rule: **secret keys go only in `.env` / `apps/web/.env.local`** — they are never committed to git.
Last synced to actual state: **2026-07-21**.

> Automation note: the regular pipeline now runs as a **GitHub Actions cron**, not a
> continuously-running worker. Redis (Upstash) is no longer required for the daily run — quota
> counters were moved to Postgres. See item 3 and the "GitHub Actions" section.

## Priority 1 — Run the app with real accounts

### 1. Supabase (database) — set up, only the password is needed
Project: `tenderlist` (ref `ubmhbtqmzrhjnzorbtky`, eu-central-1). Schema + seed loaded, RLS locked.
⚠️ "TuanaKardil's Project" belongs to another app — don't touch it.

1. supabase.com/dashboard → **tenderlist** → Settings → Database → *Reset database password*
2. Top **Connect** → ORMs tab → two connection strings:
```
DATABASE_URL=postgresql://postgres.ubmhbtqmzrhjnzorbtky:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.ubmhbtqmzrhjnzorbtky:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```
- 6543 (pooled) → app, 5432 (direct) → migrations only.
- Local development can keep using brew Postgres (port 5433); the Supabase values go into the Vercel/Railway env on deploy.

### 2. Clerk (sign-in/sign-up)
1. clerk.com → Create application: `Tenderlist`
2. Sign-in methods: **Email (magic link)** + **Google**
3. Keys into `apps/web/.env.local`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```
4. Webhook (after deploy): Configure → Webhooks → Add endpoint
   - URL: `https://SITE/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
   - Signing secret → `CLERK_WEBHOOK_SECRET`
5. Turkish UI: Customization → Localization → Turkish.

### 3. AI keys (required — pipeline + chatbot)
The AI pipeline and the tender-assistant chatbot are live and need these in `.env`:
```
OPENROUTER_API_KEY=sk-or-v1-...      # pipeline (Flash-Lite) + chatbot (gpt-5-nano)
GOOGLE_AI_API_KEY=AIza...            # embeddings (dedup, alerts, chatbot RAG) — gemini-embedding-001
TENDER_QA_MODEL=openai/gpt-5-nano    # chatbot model (override-able)
AI_CHAT_DAILY_BUDGET_USD=5           # chatbot platform-wide daily spend kill-switch
```
There is no Anthropic key anymore — everything goes through the single OpenRouter client plus Google
AI Studio for embeddings.

### 4. Upstash Redis (optional — only if the BullMQ worker path is re-activated)
The regular pipeline runs on GitHub Actions and does **not** need Redis. Only set this up if you
re-enable the continuously-running BullMQ workers:
1. console.upstash.com → Create Database: `tenderlist`, region eu-central-1, TLS enabled
2. "Redis URL" (`rediss://default:...`) → `REDIS_URL`

## Priority 2 — Payments (Phase 1d)

### 4. Paddle Sandbox
1. sandbox-vendors.paddle.com/signup → sandbox account
2. Developer Tools → Authentication:
   - API key → `PADDLE_API_KEY`
   - Client-side token → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
3. Catalog → Products:
   - `Starter`: $19/mo, $190/yr
   - `Pro`: $59/mo, $590/yr
4. Note the 4 price IDs (`pri_...`) → to be added to the code.
5. Webhook (after deploy): Developer Tools → Notifications → Destination:
   `https://SITE/api/webhooks/paddle` → secret → `PADDLE_WEBHOOK_SECRET`
6. **Live Paddle approval can take weeks — apply as soon as the site is live.**

## Priority 3 — Going live

### 5. Domain
Working name "Tenderlist", placeholder domain `tenderlist.app`. Once decided, the
email templates, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL` and SEO settings will be updated.

### 6. Meilisearch Cloud
cloud.meilisearch.com → project → `MEILISEARCH_HOST`, `MEILISEARCH_ADMIN_KEY`, `MEILISEARCH_SEARCH_KEY`.
After setup, index settings + full reindex:
`cd apps/worker && pnpm exec tsx src/scripts/meili-setup.ts --reindex`

### 7. Resend (email) — key set, domain still pending
1. `RESEND_API_KEY` is already set. **But** `EMAIL_FROM` is a placeholder (`onboarding@resend.dev`),
   which only delivers to the account owner's own address.
2. To send to real users: resend.com → Domains → add the real domain → enter the DKIM/SPF DNS
   records → set `EMAIL_FROM="Tenderlist <alerts@DOMAIN>"`.
- Without a verified domain the alert step tolerates it (logs "dev, not sent"); no crash.

### 8. GitHub Actions (the daily pipeline)
The regular pipeline runs from `.github/workflows/daily-pipeline.yml` (cron 05:00 UTC), **not** a
Railway worker. Before enabling it (currently `disabled_manually`):
1. Add the repo secrets listed in `.github/workflows/README.md`: `DATABASE_URL`,
   `MEILISEARCH_HOST/ADMIN_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_AI_API_KEY`, `AI_CHAT_DAILY_BUDGET_USD`,
   and `RESEND_API_KEY` / `EMAIL_FROM` once email is live.
2. Test with **Run workflow** (`workflow_dispatch`), then enable the cron.
- A Railway worker is only needed if you re-activate the BullMQ path (not required for the cron).

### 9. Vercel (web)
vercel.com/new → import `TuanaKardil/Tenders` → Root Directory: `apps/web`.
Env: all web variables from `.env.example`, including `OPENROUTER_API_KEY`, `GOOGLE_AI_API_KEY`,
`TENDER_QA_MODEL`, `AI_CHAT_DAILY_BUDGET_USD` (the chatbot runs in the web app).

### 10. PostHog + Sentry (Phase 1e)
- posthog.com (EU) → `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- sentry.io → `SENTRY_DSN` for web + worker

## Local development stack (ready)
```
Manual instead of brew services:
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 -o "-p 5433" start
redis-server --port 6379 --daemonize yes
meilisearch --master-key devmasterkey12345 --db-path <dir> --http-addr 127.0.0.1:7700

# migration + seed
pnpm db:migrate && pnpm db:seed
# meili settings + index
cd apps/worker && pnpm exec tsx src/scripts/meili-setup.ts --reindex
# worker + web
cd apps/worker && pnpm dev
cd apps/web && pnpm dev
```
