# GitHub Actions — daily pipeline

`daily-pipeline.yml` runs the whole tender pipeline once a day (05:00 UTC =
08:00 TR) and can be triggered manually from the Actions tab (**Run workflow**).

## Repository secrets to add

GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**.
Values come from your local `.env` (never commit that file).

| Secret | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ | every step | Supabase **pooled** URL (port 6543) from `.env` |
| `MEILISEARCH_HOST` | ✅ | index/search steps | e.g. `https://ms-xxxx.fra.meilisearch.io` |
| `MEILISEARCH_ADMIN_KEY` | ✅ | index/search steps | admin key, not the search key |
| `OPENROUTER_API_KEY` | ✅ | field extraction, classification, translate, dedupe judge | |
| `GOOGLE_AI_API_KEY` | ✅ | Tier 2 dedup embeddings | AI Studio key (the env var is `GOOGLE_AI_API_KEY`, **not** `GOOGLE_AI_STUDIO_KEY`) |
| `RESEND_API_KEY` | optional | alert emails | missing → alert step logs "(dev, not sent)" and continues |
| `EMAIL_FROM` | optional | alert emails | e.g. `Tenderlist <onboarding@resend.dev>` until the domain is verified |
| `NEXT_PUBLIC_APP_URL` | optional | email links | production URL once deployed; defaults to tenderlist.app |

Not needed by Actions: Clerk, Paddle, MapTiler, PostHog, Sentry (all web-app
concerns — the pipeline never touches them). Redis/Upstash is **deliberately
absent**: automation runs on this cron, not BullMQ.

## Cost guards

Unattended runs must never wait for human approval, so the two AI-spending
steps carry a hard budget instead: `--max-cost 2` (USD per run). If a day's
new-tender volume would exceed it, the step **fails loudly** and nothing is
spent — investigate, then re-run manually with a higher cap if it's legit.

## Incremental behaviour

Every step processes only new/changed rows: scrape inserts are
`onConflictDoNothing`, document/field/translate steps filter on "not yet
processed" columns, classification takes `--since 48` (hours), Tier 2 embeds
only missing embeddings and never re-judges stored pairs.

## Scraper note

The 5 source adapters are TypeScript, inside this repo
(`apps/worker/src/scrapers/`) — the pipeline runs them directly. If a separate
Python scraper service comes later, it will POST to `/api/ingest` on its own
schedule; this workflow would then start from the normalize step.

## First run checklist

1. Add the secrets above.
2. Actions tab → **Daily pipeline** → *Run workflow* (manual).
3. Expect: "0 new" on most steps (existing tenders are already processed) and
   green logs end-to-end. Errors about missing secrets mean a name typo.
4. Once the manual run is green, the daily cron is already live — no further
   action needed.
