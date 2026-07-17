# Setup Instructions (for the founder)

All the services the code expects and where each key goes. Full list: `/.env.example`.
Rule: **secret keys go only in `.env` / `apps/web/.env.local`** — they are never committed to git.

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

### 3. Upstash Redis (live queues)
1. console.upstash.com → Create Database: `tenderlist`, region eu-central-1, TLS enabled
2. "Redis URL" (`rediss://default:...`) → `REDIS_URL`
- Locally, brew Redis is enough; this value is for deploy.

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

### 7. Resend (email)
1. resend.com → Domains → add the domain → enter the DKIM/SPF DNS records
2. API key → `RESEND_API_KEY`, sender → `EMAIL_FROM="Tenderlist <alerts@DOMAIN>"`
- Without `RESEND_API_KEY` the worker doesn't send emails, it logs them (dev mode).

### 8. Railway (worker)
railway.app → connect via GitHub → `TuanaKardil/Tenders` repo.
Service settings: root `apps/worker`, start `pnpm exec tsx src/index.ts`.
Env: `DATABASE_URL` (pooled), `REDIS_URL`, `MEILISEARCH_HOST/ADMIN_KEY`,
`RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`.

### 9. Vercel (web)
vercel.com/new → import `TuanaKardil/Tenders` → Root Directory: `apps/web`.
Env: all web variables from `.env.example`.

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
