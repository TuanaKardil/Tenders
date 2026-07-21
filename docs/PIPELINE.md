# Tenderlist — Tender Processing Pipeline (scrape → publish)

> This file is the design of every step from when a tender is scraped until it is published.
> It is a decision record; kept here so it isn't forgotten.
> Related: [`ROADMAP.md`](./ROADMAP.md).
> Last synced to actual code state: **2026-07-21**. Every stage below is built and running as a
> direct, Redis-free script wired into the daily GitHub Actions run.

## Daily flow (summary)

```
GitHub Actions cron — 05:00 UTC (08:00 TR), currently disabled until deploy
  → 1-2. Scrape (6 sources) + Normalize (same-source dedup, notice-type resolve)
  → 3.  Cross-source dedup — TIER 1 (deterministic, cheap)
  → 4a. Capture document URLs
  → 4b. Download documents + PDF/Word/Excel/OCR text extraction
  → 5.  AI field extraction (+ publish gate at confidence >= 0.7)
  → 6.  Classification gate (is it a tender?) — non-tenders dropped
  → 7.  AI translate + SUMMARY (EN+TR, + eligibility_notes_tr)
  → 8.  Cross-source dedup — TIER 2 (embedding + LLM judge)
  → 9.  Meili reindex (published only, one canonical per cluster)
  → 10. Alert match (keyword ∪ semantic) → email
  → 11. Coverage spot-check audit (1 sample per detail-fetch source)
```

Step order matches `.github/workflows/daily-pipeline.yml`. `unknown` notice types are NOT published;
they wait in the founder-approval queue (`/admin/eleme`) until confirmed.

---

## Stage by stage

### 0. Scheduler — GitHub Actions · ✅ built, ⏸️ disabled
`.github/workflows/daily-pipeline.yml`, cron `0 5 * * *` + `workflow_dispatch`, fail-fast,
concurrency-guarded, 30-min timeout. Replaces the old BullMQ `schedules` scaffold (see
ROADMAP "Automation decision"). Currently `disabled_manually` until deploy.

### 1. Scrape — `apps/worker/src/scrapers/` · ✅ built
Six adapters fetch **open + last 7 days** tenders (`shared.ts` `isRecentAndOpen`, future-dated
dropped). Sources: Kenya (`/api/active-tenders`), TED (REST API + structured fields), Guinea
(WordPress detail-fetch), Ethiopia (`cms-v2/get-grouped-sourcing`), UNGM (search HTML), Uganda
(HTML). Orchestrated by `backfill.ts`; each run writes an `ingestion_runs` row and updates
`sources.last_run_at`.

### 2. Normalize — `backfill.ts` / `normalize` worker · ✅ built
`raw_notice` → `tenders` upsert keyed on (source + notice_id) + `source_hash`. Notice type is
resolved through the self-growing dictionary here (see "Notice-type dictionary" below). UNGM ids are
now the stable `data-noticeid` (fixed a duplicate-ingest bug).

### 3. Cross-source dedup — TIER 1 (deterministic) · ✅ `dedupe-tier1.ts`
The same tender can appear on several portals. Filtered BEFORE the expensive AI. Signals: same
country + normalized buyer + normalized title + closing ±2 days, OR one source's URL contained in
another's. Union-find → `dedupe_clusters`. Reversible (only sets `dedupe_cluster_id`).

### 4. Download documents + extraction (PDF/Word/Excel/image) · ✅ `extract-documents.ts`
**Most notices' real information is in the attached document.**
- Capture attachment URLs (`backfill-documents.ts`; Guinea also captures embedded scan images).
- Download → extract text, then discard the file (never hosted; migration **0003** stores only text):
  - PDF (text layer) → `pdf-parse`; trivial text layer (< `MIN_REAL_TEXT` = 100 chars) → Gemini OCR
  - DOCX → mammoth · legacy .doc → word-extractor · XLSX/XLS → SheetJS
  - Images (PNG/JPG/webp) & scanned PDF → Gemini multimodal OCR (`google/gemini-2.5-flash`)
- Extracted text is the input to stage 5 and to the summary in stage 7.

### 5. AI field extraction (+ publish gate) · ✅ `extract-fields.ts`
Title + description + all document texts → `google/gemini-2.5-flash-lite` → structured fields:
value, currency, sector, CPV, eligibility, closing date, notice type, and an
`extraction_confidence`. The prompt forbids guessing. Results are written through the single merge
rule (see "Documents as first-class data"). **Publish gate:** `extraction_confidence ≥ 0.7` →
publish; below → admin review queue.

### 6. Classification gate (is it a tender?) · ✅ `classify.ts`
- **Tier 1 (cheap, no AI):** the canonical `notice_type` enum + title keywords. Keep
  tender/rfp/rfq/eoi/prequalification; drop award/cancellation/disposal/vacancy/amendment.
- **Tier 2 (Flash-Lite):** only ambiguous ones. "Not a tender" → dropped with a recorded
  `unpublish_reason` and removed from Meili (reversible). `unknown` types are held for
  founder approval rather than auto-published.

### 7. AI translate + SUMMARY (EN+TR) · ✅ `translate-summarize.ts`
Produces `title_en/tr`, `summary_en/tr` and `eligibility_notes_tr` (migration **0010**). The AI
summary on every tender page comes from this; it also powers TR search. Model:
`google/gemini-2.5-flash-lite`. A deterministic filler-sentence stripper removes "not specified"-type
padding; a humanized style rule keeps answers scannable. As the last consumer in the chain it stamps
`docs_merged_at` (self-healing hook).

### 8. Cross-source dedup — TIER 2 (semantic) · ✅ `dedupe-tier2.ts`
For duplicates Tier 1 missed. `title_en + summary_en` embedded with `gemini-embedding-001` into
pgvector (`tender_embeddings`, migration **0006**). Candidates: different source, same country
(hard guard), closing ±7 days, cosine ≥ 0.85 → Flash-Lite "same tender?" judge. Judge-yes + sim ≥
0.90 auto-merge; 0.85–0.90 → `dedupe_candidates` review; no → rejected (re-runs skip judged pairs).

### 9. Meili index — `meili-setup.ts --reindex` / `index-sync` · ✅ built
Published tenders (one canonical per cluster) are pushed to Meilisearch. Unpublished / dropped /
non-primary tenders are removed. Runs before alerts because alert matching queries Meili.

### 10. Alert match — `run-alerts.ts` (+ `alerts` worker) · ✅ built
New tenders ↔ users' saved searches, TWO-PATH: keyword (Meili) ∪ semantic (embedding cosine ≥
`SEMANTIC_ALERT_THRESHOLD = 0.57`), hard filters applied to both paths. Match type
(`keyword | semantic | both`) stored in `alert_deliveries.match_types` (migration **0011**). Email
dispatched via Resend; semantic-only matches go in a separate "possibly relevant" section.

### 11. Coverage spot-check audit · ✅ `audit-coverage.ts`
Once per run, for each detail-fetch source, one random tender's detail page is re-fetched and its
document links counted independently of the scraper (its own cheerio pass), then compared to
`documents_count`. Mismatches (site > DB) are recorded in `document_coverage_audits` (migration
**0017**) with the missed URLs, surfaced on `/admin/kapsam-denetim`. 500 ms same-domain spacing,
≤ 1 request per source.

### Status refresh — `status-refresh` worker · ✅ built
open → closing_soon → closed based on the deadline; closed ones drop from the index. (Not yet a
step in the Actions workflow; runs via the BullMQ worker path when active.)

---

## Notice-type dictionary (self-growing) · ✅

`notice_type_mappings` (migration **0007**) maps raw source phrases → the canonical enum.
Resolution order (`apps/worker/src/lib/notice-type-resolver.ts`): DB(source) → DB(general) → static
in-code dictionary → AI learning (Flash-Lite). Confident AI mappings become active automatically;
uncertain ones land in `pending_review` for the founder at **`/admin/sozluk`**. `amendment` enum
value added in migration **0015**.

---

## Documents as first-class data (merge + provenance) · ✅

Everything from HTML/API and from every document flows into `tenders` through ONE rule
(`apps/worker/src/lib/merge-tender.ts`).

- **Fill priority per critical field:** source-structured value → AI extraction (page text + all
  document texts, capped) → and a filled value is **never** downgraded or overridden by an AI null.
- **Field provenance** — `tenders.field_provenance` jsonb (migration **0008**): each critical field
  records `source_page | document | ai_page_text | manual`. Matrix on `/admin/kapsam`.
- **Self-healing** — `tenders.docs_merged_at` (migration **0009**): a document extracted after a
  tender's last merge re-queues the tender in the daily field-extraction + summary steps
  (`STALE_DOCS_SQL`), so late-arriving attachments are always merged.
- **Source contract** — `packages/config/src/source-contract.ts`: required vs expected fields,
  "detail page wins", 300-char snippet cap, `DETAIL_FETCH_SOURCES`. Guinea is the reference
  implementation, including embedded scan-image capture.

---

## AI layer — model & task table

| Task | Model | Provider | Note |
|------|-------|----------|------|
| Tender SUMMARY + translation (every page) | `google/gemini-2.5-flash-lite` | OpenRouter | Very cheap, high volume |
| Field extraction (JSON) | `google/gemini-2.5-flash-lite` | OpenRouter | Forbids guessing; confidence gate |
| Classification (is it a tender?) | `google/gemini-2.5-flash-lite` | OpenRouter | Cheap, only ambiguous ones |
| Notice-type learning | `google/gemini-2.5-flash-lite` | OpenRouter | Fills the dictionary |
| Dedup LLM judge (borderline) | `google/gemini-2.5-flash-lite` | OpenRouter | Only pairs ≥ 0.85 cosine |
| Document / image reading (OCR) | `google/gemini-2.5-flash` | OpenRouter | Multimodal; PDF fallback + images |
| Embeddings (dedup, alerts, chatbot RAG) | `gemini-embedding-001` | Google AI Studio | pgvector, 768 dims, task types |
| **Chatbot (per-tender Q&A)** | `openai/gpt-5-nano` | OpenRouter | `TENDER_QA_MODEL` env, reasoning-model |

`.env`: `OPENROUTER_API_KEY` (pipeline + chatbot), `GOOGLE_AI_API_KEY` (embeddings),
`TENDER_QA_MODEL` (chatbot model override), `AI_CHAT_DAILY_BUDGET_USD` (chatbot daily kill-switch).
There is no Anthropic dependency; the single OpenRouter client lives in `packages/ai/openrouter.ts`.

---

## AI Tender Assistant (chatbot) — how it works

Per-tender, read-only Q&A on the detail page (Phase 8, commits **aa8f727 → f4228ad**).

- **Endpoint** `apps/web/src/app/api/tenders/[id]/qa/route.ts`: Clerk login required (anon → 401),
  unpublished → 404, context built server-side from the route's own tender lookup — no cross-tender
  path exists. Order: auth → validation → budget → rate limits → plan quotas → cache → AI →
  cache store + usage ledger.
- **Lazy RAG** `tender_document_chunks` (migration **0013**): a tender's documents are chunked and
  embedded on its first question (gemini-embedding-001, RETRIEVAL_DOCUMENT/QUERY task types, separate
  from the dedup/alert vectors), reused after; answers cite the source document.
- **Quotas / cache / ledger** `ai_usage_events` + `ai_answer_cache` (migration **0014**), all
  Postgres COUNT/SUM (no Redis). Limits from `entitlements.ts`: `aiQuestionsPerMonth` 10/250/2000,
  `aiQuestionsPerTenderPerDay` 3/20/100; 5 req/min/user + 20 req/min/IP; 30-day answer cache;
  platform daily budget `AI_CHAT_DAILY_BUDGET_USD`.
- **Language guarantee:** detect the question language, pin it, and correct with a translation pass
  if the model answers in the wrong one.
- **Eval:** `cd apps/web && pnpm eval:qa` (real model runs) — 10/10 (answer+citation, NOT_FOUND,
  FR/AR/TR, prompt injection direct + in-document, cross-tender refusal, unpublished isolation,
  abuse limit).

---

## Build status

| Piece | Status |
|---|---|
| Scrape (6 sources) · Normalize · Publish gate · Index · Alert · Email · Status | ✅ |
| Notice-type dictionary + `/admin/sozluk` review | ✅ |
| Cross-source dedup — Tier 1 (deterministic) | ✅ |
| Cross-source dedup — Tier 2 (embedding + LLM) + pgvector | ✅ |
| Classification gate (is it a tender?) | ✅ |
| Download documents + PDF/Word/Excel/OCR | ✅ |
| AI field extraction + publish gate | ✅ |
| AI translate + summary (Flash-Lite) | ✅ |
| Documents-as-data: merge rule + provenance + self-healing | ✅ |
| Semantic alerts (embedding, threshold 0.57) | ✅ |
| TED enrichment (structured fields + lots jsonb) | ✅ |
| AI Tender Assistant (chatbot) | ✅ |
| Coverage guarantee (counter + anomaly alarm + spot-check audit) | ✅ |
| Scheduler — GitHub Actions cron | ✅ built, ⏸️ disabled until deploy |
| Canonical "also listed on" UI block on the detail page | 🔴 backlog |

**Operational:** the regular pipeline runs as a GitHub Actions cron (no continuously-running worker
needed). Enable it after deploy once the secrets in `.github/workflows/README.md` are set.
