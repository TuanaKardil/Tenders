# Tenderlist — Roadmap (single source of truth)

> Kept in the repo so the plan survives even if the chat is closed.
> **Update the status here whenever a phase / setup step is done.**
> Step-by-step account setup guide: [`docs/SETUP.md`](./SETUP.md).
> Last synced to actual code state: **2026-07-21**.

Product: Africa-first global tender discovery SaaS. Core loop:
sign up → set an alert in 3 minutes → get a useful email → click through to the original source.

Stack: Next.js 15 (App Router, TS strict) · Tailwind v4 · shadcn/ui · PostgreSQL (Supabase) +
Drizzle · Meilisearch · pgvector · Clerk · Paddle · Resend · next-intl (en/tr) · Vercel (web) ·
GitHub Actions (daily pipeline). AI: **OpenRouter** (Gemini Flash-Lite pipeline + gpt-5-nano
chatbot) + **Google AI Studio** (gemini-embedding-001). PostHog + Sentry (env-gated).

> Note: BullMQ + Redis (Upstash) is still in the codebase (workers, `connection.ts`), but the
> **regular pipeline no longer depends on a running worker** — it runs as a GitHub Actions cron
> (see "Automation decision" below). Quota counters were moved to Postgres. Redis is only needed
> post-deploy if the BullMQ path is ever re-activated.

---

## Phase status

| Phase | Content | Status |
|-------|---------|--------|
| **0** | Monorepo, Next.js/TS/Tailwind/shadcn, worker, Drizzle schema, CI (lint+typecheck+test) | ✅ committed |
| **1a** | `api/ingest`, normalize worker, admin sources/runs, migration `0000` | ✅ committed |
| **1b** | `/search` (Meili+facets), `/tenders/[slug]`, `/go/[id]` tracked redirect, `/map`, landing | ✅ committed |
| **1c** | `/onboarding`, saved-searches, alert engine (instant/daily/weekly), digest email, `/dashboard`, `/watchlist`+ICS | ✅ committed |
| **1d** | Revenue: `/pricing`, Paddle checkout+webhook, quota gates, quota-hit/trial email | ✅ code (awaiting Paddle account + env) |
| **1e** | Polish/launch: SEO, Sentry+PostHog, legal, `/countries`·`/sectors`·`/blog`, not-found/error | ✅ code (Lighthouse pass after deploy) |
| **2 — Data** | 6 real scrapers live; ~428 real tenders (392 published) | ✅ live |
| **3 — AI brain** | Field extraction · classification · dedup (Tier 1 + Tier 2) · translate/summary · document OCR | ✅ **4/4 done** |
| **4 — Self-growing dictionary** | DB-backed notice-type dictionary + AI learning + `/admin/sozluk` review | ✅ done |
| **5 — Documents as first-class data** | source-contract, OCR fallback, field_provenance, single merge rule, self-healing | ✅ done |
| **6 — Semantic alerts** | Embedding-based alert matching (threshold 0.57) + digest split | ✅ done |
| **7 — TED enrichment** | Structured TED fields + `lots` jsonb | ✅ done |
| **8 — AI Tender Assistant (chatbot)** | Per-tender read-only Q&A (gpt-5-nano, lazy RAG, quotas, eval) | ✅ done |
| **9 — Automation** | Daily pipeline as GitHub Actions cron (currently disabled) | ✅ built, ⏸️ off until deploy |

---

## Phase 2 — Data / scrapers (✅ live)

Scrapers run as **in-repo TS adapters** (`apps/worker/src/scrapers/`) orchestrated by
`apps/worker/src/scripts/backfill.ts` (a direct, Redis-free load). Rule:
**only open AND published in the last ~7 days** (`shared.ts` `isRecentAndOpen`, future-dated
dropped). Each source records an `ingestion_runs` row and updates `sources.last_run_at`.

| Source | Slug | Type | Detail fetch | Tenders (published) |
|--------|------|------|--------------|---------------------|
| Kenya PPIP | `ke-ppip` | Hidden JSON API `/api/active-tenders` | docs from list payload | 163 (163) |
| TED (EU) | `ted-eu` | Official REST API | docs from `links.pdf` + structured fields | 92 (92) |
| Guinea JAO | `gn-jao` | WordPress/Elementor (cheerio) | ✅ `fetchDetail` (source-contract) | 88 (67) |
| Ethiopia eGP | `et-egp` | Hidden JSON API `cms-v2/get-grouped-sourcing` | not yet (backlog) | 57 (57) |
| UNGM | `ungm` | Search POST → HTML rows (cheerio) | not yet (backlog) | 22 (8) |
| Uganda eGP | `ug-egp` | Server-rendered HTML (cheerio) | not yet (backlog) | 6 (5) |

**6/6 sources live — ~428 real tenders, 392 published.** The gap between total and published is the
founder-approval queue (unknown notice types, held until confirmed) plus classification drops and
`duplicate_ingest` cleanups.

Guinea is the reference **source-contract** implementation (`SOURCE_CONFIG.requiresDetailFetch`,
`fetchDetail`), including embedded scan-image capture (some notices are published as body images,
not attachments). Document coverage on Guinea is 100% after the scan-image work.

---

## Phase 3 — AI brain (✅ 4/4 done)

All previously-🔴 pipeline stages are built as direct, Redis-free scripts and wired into the daily
Actions run. Provider: **OpenRouter**, model `google/gemini-2.5-flash-lite` for text tasks and
`google/gemini-2.5-flash` for image/OCR (`apps/worker/src/lib/ai.ts`).

- **Field extraction** — `apps/worker/src/scripts/extract-fields.ts` → structured fields (value,
  currency, sector, CPV, eligibility, closing date, notice type, confidence). Publish gate:
  `extraction_confidence ≥ 0.7`, else the admin review queue.
- **Classification gate** — `apps/worker/src/scripts/classify.ts`. Tier 1 cheap enum/keyword rules,
  Tier 2 Flash-Lite for ambiguous ones. Non-tenders (award/vacancy/disposal/news/amendment) are
  dropped with a recorded reason.
- **Dedup Tier 1 (deterministic)** — `apps/worker/src/scripts/dedupe-tier1.ts`. Same-country +
  normalized buyer/title + closing ±2d, or URL containment. Union-find clusters.
- **Dedup Tier 2 (semantic)** — `apps/worker/src/scripts/dedupe-tier2.ts`. `gemini-embedding-001`
  vectors in pgvector (`tender_embeddings`, migration **0006**), cross-source candidates ≥ 0.85
  cosine → Flash-Lite "same tender?" judge (`dedupe_candidates`).
- **Translate + summary** — `apps/worker/src/scripts/translate-summarize.ts` → `title_en/tr`,
  `summary_en/tr`, plus `eligibility_notes_tr` (migration **0010**). This is the AI summary shown on
  every tender page; it also powers TR search.
- **Document OCR** — `apps/worker/src/scripts/extract-documents.ts` + `lib/doc-extract.ts`. PDF
  (pdf-parse) with an OCR fallback when the text layer is trivial (`MIN_REAL_TEXT = 100`), DOCX
  (mammoth), legacy .doc (word-extractor), XLSX (SheetJS), images incl. webp (Gemini multimodal).
  Files are never hosted; only extracted text is stored (migration **0003**).

---

## Phase 4 — Self-growing notice-type dictionary (✅ done)

`notice_type_mappings` table (migration **0007**) is the single source of truth for mapping raw
source phrases → the canonical enum. Resolution order (`apps/worker/src/lib/notice-type-resolver.ts`):
DB(source) → DB(general) → static in-code dictionary → AI learning (Flash-Lite). Unknown phrases the
AI is unsure about land in `pending_review` and are decided by the founder at **`/admin/sozluk`**;
confident ones become active mappings automatically. `amendment` was added as an enum value
(migration **0015**) for prorogation/addendum notices (treated as non-tender).

---

## Phase 5 — Documents as first-class data (✅ done)

Everything from HTML/API and from every document flows into `tenders` through one rule.

- **Source contract** — `packages/config/src/source-contract.ts` defines required/expected fields,
  the "detail page wins" precedence, the 300-char body-snippet cap, and `DETAIL_FETCH_SOURCES`.
- **Single merge rule** — `apps/worker/src/lib/merge-tender.ts`: source-structured value → AI
  (page text + all document texts) → never downgrade a filled value; scraper adapters carry no
  merge logic.
- **Field provenance** — `tenders.field_provenance` jsonb (migration **0008**) records where each
  critical field came from (`source_page` / `document` / `ai_page_text` / `manual`). Shown as a
  matrix on `/admin/kapsam`.
- **Self-healing** — `tenders.docs_merged_at` (migration **0009**): a document extracted after a
  tender's last merge re-queues that tender automatically, so late-arriving attachments are never
  missed (`STALE_DOCS_SQL` in `merge-tender.ts`).
- **Coverage guarantee (3 layers)** — 6a document-suspicion counter + full per-source coverage table
  on `/admin/kapsam`; 6b anomaly alarm (`sources.avg_docs_per_tender_30d`, migration **0016**);
  6c per-run spot-check audit (`audit-coverage.ts` → `document_coverage_audits`, migration **0017**)
  surfaced on `/admin/kapsam-denetim`, with a red "seçici kırılmış olabilir" flag on `/admin/sources`.

---

## Phase 6 — Semantic alerts (✅ done)

Alert matching is two-path: keyword (Meili, as before) ∪ semantic (embedding cosine). Saved searches
get an `embedding` and `alert_deliveries` gets a `match_types` jsonb (migration **0011**). The
threshold lives in `packages/config/src/alerts.ts` (`SEMANTIC_ALERT_THRESHOLD = 0.57`, calibrated,
never hardcoded at call sites). Hard filters (country/date/value) are applied to BOTH paths, so
semantic similarity can never smuggle a tender past a hard filter. Matches carry
`keyword | semantic | both` labels; the digest email shows semantic-only matches in a separate
"possibly relevant / ilgili olabilecek ihaleler" section.

---

## Phase 7 — TED enrichment (✅ done)

Audit found TED serves ~1830 fields; the scraper took 9 and three existing columns sat at 0%.
Added `procedure-type → procurement_method`, `contract-nature → contract_type`,
`total-value → estimated_value/currency`, and a per-lot breakdown into a new `tenders.lots` jsonb
(migration **0012**). Backfill re-fetched all 92 TED tenders by publication-number
(`backfill-ted-fields.ts`) with no-downgrade + source-wins merge (provenance `source_page`).
Result on 92: procurement_method 0→100%, contract_type 0→100%, lots 0→100%.

---

## Phase 8 — AI Tender Assistant / chatbot (✅ done)

Per-tender, read-only Q&A assistant on the tender detail page. Commits **aa8f727 → f4228ad**.

- **Provider layer** — `packages/ai` holds the single `openRouterChat` client. Model configurable
  via `TENDER_QA_MODEL` env, default **`openai/gpt-5-nano`** (OpenRouter). Prompt in
  `prompts/tender-qa.md`; structured JSON out `{status, language, answer, citations}`.
- **Endpoint** — `apps/web/src/app/api/tenders/[id]/qa/route.ts`. Clerk **login required**
  (anonymous → 401), unpublished tenders → 404, context built server-side from the route's own
  tender lookup (no cross-tender path). Question ≤ 500 chars, one retry, 30s timeout.
- **Lazy RAG** — `tender_document_chunks` (migration **0013**). On a tender's first question its
  documents are chunked (~1000 chars / 150 overlap) and embedded (gemini-embedding-001,
  RETRIEVAL_DOCUMENT/QUERY task types, separate from the dedup/alert vectors); later questions reuse
  them. Answers cite the document they came from.
- **Quotas / rate / cache / ledger** — `ai_usage_events` + `ai_answer_cache` (migration **0014**),
  all counters **Postgres** (no Redis). Limits in `entitlements.ts`: `aiQuestionsPerMonth`
  10/250/2000 and `aiQuestionsPerTenderPerDay` 3/20/100 (free/starter/pro); 5 req/min/user +
  20 req/min/IP; 30-day answer cache keyed on tender + normalized question + knowledge version.
  Platform-wide daily kill-switch `AI_CHAT_DAILY_BUDGET_USD` (default 5).
- **Language guarantee** — two-pass: a tiny language-detection pre-call pins the question's language,
  and if the model still answers in the wrong language a corrective translation pass fixes it (a
  French tender no longer drags an English question into French).
- **Admin + eval** — `/admin/asistan` monitoring (usage, cost, cache-hit, failures, per-user,
  most-asked); evaluation suite `cd apps/web && pnpm eval:qa` (real model runs) passes **10/10**
  (correct answer + citation, NOT_FOUND, FR/AR/TR language, prompt injection direct + inside a
  document, cross-tender refusal, unpublished isolation, abuse limit).

---

## Phase 9 — Automation decision (✅ built, ⏸️ off)

**Decision: the regular pipeline runs as a GitHub Actions cron, not a continuously-running BullMQ
worker.** Rationale: the Upstash free quota was exhausted by constant queue polling, and the pipeline
is a once-a-day batch, so a cron is the right shape. Quota counters were already moved to Postgres,
so nothing user-facing depends on Redis anymore.

- Workflow: `.github/workflows/daily-pipeline.yml`. Cron `0 5 * * *` (05:00 UTC = 08:00 TR) +
  `workflow_dispatch` for manual runs. Single job, fail-fast, concurrency-guarded, 30-min timeout.
- Steps (in order): scrape+normalize → dedup T1 → capture doc URLs → extract doc text → AI fields
  (publish gate) → classification → translate+summarize → dedup T2 → Meili reindex → run alerts →
  coverage spot-check.
- **Currently disabled** (`workflow disabled_manually`) until deploy. Secrets to add before enabling
  are listed in `.github/workflows/README.md`.
- The BullMQ workers still exist (`apps/worker/src/workers/`); `connection.ts` is now lazy so
  direct scripts don't require `REDIS_URL`. Re-activate only if a real-time path is needed.

---

## Setup checklist (real accounts)

Details + verification commands in [`docs/SETUP.md`](./SETUP.md). Secret keys go **only** in
`.env` / `apps/web/.env.local` (never committed).

- [x] **Supabase** — connected; migrations 0000–0017 applied; real scraped data loaded
- [x] **Meilisearch Cloud** — host+keys connected; reindexed (392 published docs); `/search` returns real data
- [x] **Clerk** — connected (web-only) + `getCurrentUser` lazy-provision for local dev
- [x] **OpenRouter** — `OPENROUTER_API_KEY` set; pipeline AI + chatbot live
- [x] **Google AI Studio** — `GOOGLE_AI_API_KEY` set; embeddings (dedup, alerts, RAG) live
- [x] **MapTiler** — `NEXT_PUBLIC_MAPTILER_KEY` connected; globe tiles + bubbles work
- [~] **Resend** — `RESEND_API_KEY` set, but `EMAIL_FROM` is still a placeholder domain
  (`onboarding@resend.dev` only delivers to the account owner). Verify a real domain before sending
  to users; alert dispatch tolerates a missing/placeholder key (logs "dev, not sent").
- [ ] **Paddle** — placeholders only; sandbox account + price IDs still needed (Phase 1d)
- [ ] **PostHog + Sentry** — env-gated, dormant until DSN/key set (Phase 1e)

**Positioning:** the product is **global**; Africa is the current seed focus, not a hard scope.

---

## Next work

### User actions (small, before/around deploy)
- Clean up the synthetic 10 quota events seeded for the chatbot quota test (otherwise that account
  stays rate-limited this month).
- Set `AI_CHAT_DAILY_BUDGET_USD=5` in the deploy env and add the Actions secrets from
  `.github/workflows/README.md`.
- Decide the ~14 pending FR notice-type phrases at `/admin/sozluk` and the founder-approval queue at
  `/admin/eleme`.

### Big direction (pick one)
- **Deploy path:** domain decision → Vercel (web) → Resend domain verification → end-to-end email
  test → enable the Actions cron → Lighthouse pass (mobile > 85).
- **Cold-start more sources:** widen coverage; each new source through the source-contract with its
  own DRY → approval → apply and a before/after coverage report.

### Backlog (`docs/BACKLOG.md` + here)
- Migrate UNGM/Uganda/Ethiopia to the source contract (detail-page + document fetch, Guinea pattern)
  so their document coverage stops being 0.
- Admin approval-queue ergonomics; `extraction_confidence` calibration; a cluster block on the tender
  detail page; extra eval rows for Thai/German; Redis quota-log cleanup if the BullMQ path returns.

---

## Red lines (unchanged)

- **No document hosting.** We link to documents and store only extracted text, never the file.
- **No full body text stored.** Yellow-license sources keep at most a 300-char snippet.
- **Source health:** a source that returns nothing for 2 runs in a row raises an alarm on
  `/admin/sources`.
- **Chatbot stays in scope:** it answers only about the current tender; other-tender / general /
  injection requests are refused (OUT_OF_SCOPE), documents are treated as data not instructions.

---

## Open decisions (can proceed with defaults)

- Domain: `tenderlist.app` placeholder — once decided, update `EMAIL_FROM` / `NEXT_PUBLIC_APP_URL` /
  SEO and verify the domain in Resend.
- Pricing USD-only, monthly+annual. Paddle live approval can take weeks → apply as soon as the site
  is live.
