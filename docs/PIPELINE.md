# Tenderlist — Tender Processing Pipeline (scrape → publish)

> This file is the design of every step from when a tender is scraped until it is published.
> It is a decision record; kept here so it isn't forgotten.
> Related: [`ROADMAP.md`](./ROADMAP.md).

## Daily flow (summary)

```
CRON ~12:00
  → 1. Scrape (5 sources)
  → 2. Normalize (same-source dedup)
  → 3. ⭐ Cross-source dedup — TIER 1 (cheap, BEFORE AI)
         ├─ duplicate → attach to cluster, add source link, SKIP AI (cheap)
         └─ new       ↓
  → 4. Download documents + PDF/Word/OCR text extraction
  → 5. AI field extraction + ⭐ CLASSIFICATION (is it a tender?)
         ├─ not a tender (job posting/award/disposal/news) → DROP
         └─ tender ↓
  → 6. AI translate + SUMMARY (EN+TR)
  → 7. ⭐ Cross-source dedup — TIER 2 (embedding + LLM judge)
  → 8. Publish gate (extraction_confidence ≥ 0.7)
  → 9. Meili index (ONE canonical per cluster)
  → 10. Alert match
  → 11. Email (Resend)
  → 12. Status refresh (open/closing_soon/closed)
```

---

## Stage by stage

### 0. Scheduler — `schedules` · 🟡 scaffold
A repeatable BullMQ job every day ~12:00; enqueues a scrape job for each of the 5 active sources.

### 1. Scrape — `apps/worker/src/scrapers/` · ✅ built
Each adapter fetches **open + last 7 days** tenders (`isRecentAndOpen`, future-dated dropped).
Sources: TED (API), Kenya (`/api/active-tenders`), Ethiopia (`cms-v2/get-grouped-sourcing`),
Uganda (HTML), UNGM (search HTML). → `/api/ingest` → `raw_notices`.

### 2. Normalize — `normalize` worker · ✅ built
`raw_notice` → `tenders` upsert. Same-source dedup: (source + notice_id) + `source_hash`.
Same hash → untouched; changed → continue.

### 3. Cross-source dedup — TIER 1 (deterministic, cheap) · 🔴 new · `dedupe` worker
The same tender can appear on 3 different sites (UN/World Bank-funded ones often do). Filtered
BEFORE AI so duplicates don't hit the expensive AI.
- **Block:** `country + closing date (±2 days)` (avoids O(n²))
- **Score:** normalized reference no (strongest) + buyer-name similarity (token/Jaccard) + value +
  title trigram
- Over the threshold → same **cluster** (`dedupe_clusters`, already in the schema). Duplicate →
  attach to the cluster, add the source link, **skip AI**.

### 4. Download documents + extraction (PDF/Word/image) · 🔴 new · `extract` worker
**Most notices' real information is in the attached document.** Steps:
- Download attachments (`documents[].url`)
- **PDF → text** (pdf-parse / pdfjs)
- **Word → text** (docx parser)
- **Image / scanned PDF → OCR** (tesseract.js, or Gemini's image-reading ability)
- The resulting raw text becomes input to the AI in stage 5. (Note: because Gemini is multimodal,
  the PDF/image can be fed directly to the model to do both text extraction and summary in a
  single call — to be chosen based on a cost/latency test.)

### 5. AI field extraction + CLASSIFICATION · 🔴 new · `extract` worker
Title + description + document text → AI:
- **Structured fields:** buyer, deadline, estimated value, currency, sector, CPV,
  eligibility terms, notice type + a **confidence score**.
- **CLASSIFICATION (is it a tender?):** "Is this an open tender (a buyer looking for a
  supplier/contractor), or a job posting / award / asset disposal / news?"
  - Cheap pre-filter: the `notice_type` enum (keep only tender/rfp/rfq/eoi/prequalification;
    drop award/cancellation/disposal/vacancy). Don't take Uganda's "Disposal" column.
  - AI confirmation: for ambiguous ones. "Not a tender" → **DROP, don't publish.**

### 6. AI translate + SUMMARY (EN+TR) · ✅ script (backfill), 🟡 queued worker
- Produces `title_en/tr`, `summary_en/tr`. **The AI summary on every tender page comes from this.**
- (This also unlocked TR search — English content now shows in TR search.)
- **Model: Gemini 2.5 Flash-Lite** (for summaries — very cheap, suited to high volume; founder's choice).
- Built as a Redis-free direct script: `apps/worker/src/scripts/translate-summarize.ts` (via
  `apps/worker/src/lib/ai.ts`, OpenRouter). Applied to all ~254 live tenders + Meili reindexed.
  Still TODO: wire it as a BullMQ `translate-summarize` worker for the daily pipeline.

### 7. Cross-source dedup — TIER 2 (semantic) · 🔴 new
For duplicates Tier 1 missed (very different language/format):
- Embedding of `buyer | title | country | deadline` (in pgvector)
- High cosine similarity in the same block → candidate; **0.75–0.90 → LLM judge** ("same one?")
- If the same → merge clusters, unpublish the redundant one.

### 8. Publish gate — `publish-gate` · ✅ logic built
- `extraction_confidence ≥ 0.7` → **publish** (`is_published = true`)
- `< 0.7` → **admin review queue** (`/admin`), manual approval.
- **One canonical** per cluster is published (canonical = national portal matching the country >
  most documents/highest quality_score; the others are "mirrors").

### 9. Meili index — `index-sync` worker · ✅ built
The canonical published tender goes to Meili → searchable on the site. Closed/unpublished ones are removed.

### 10. Alert match — `alert-match` worker · ✅ built
New tender ↔ users' saved searches. Match + frequency (instant/daily/weekly) →
email job. (A user is alerted **once** per cluster.)

### 11. Email — `email-dispatch` worker · ✅ built (awaiting Resend key)
Digest email via Resend. → Core loop complete.

### 12. Status refresh — `status-refresh` worker · ✅ built
Daily: open → closing_soon → closed based on the deadline; drop closed ones from the index.

---

## AI layer — model & task table (via OpenRouter)

| Task | Model | Note |
|------|-------|------|
| **Tender SUMMARY (every page)** | **Gemini 2.5 Flash-Lite** | Founder's choice; very cheap, high volume |
| Field extraction (JSON) | Gemini 2.5 Flash | Stronger; escalate to Pro on low confidence |
| Translation EN↔TR | Gemini 2.5 Flash / Flash-Lite | |
| Classification (is it a tender?) | Flash-Lite | Cheap, binary decision |
| Document/image reading (OCR) | Gemini multimodal **or** tesseract.js | To be tested and chosen |
| Dedup embedding | Gemini/OpenAI embeddings | Stored in pgvector |
| Dedup LLM judge (borderline) | Flash | Only for undecided pairs |

`.env`: `OPENROUTER_API_KEY` ready. `OPENROUTER_MODEL=google/gemini-2.5-flash` (to be set to
Flash-Lite for summaries; model can be chosen per task).

---

## Document (PDF/Word/image) extraction — how we'll do it

**Problem:** In some notices the real information (scope, terms, deadline) is **in the attached PDF/Word/image.**

**Solution (stages 4 + 6):**
1. Get the attached document URLs (`documents[]`).
2. Download → detect type (PDF / DOCX / JPG-PNG / scanned-PDF).
3. Extract text:
   - PDF (with text layer) → `pdf-parse`/`pdfjs`
   - DOCX → docx parser
   - Image / scanned PDF → **OCR** (tesseract.js) **or** feed directly to Gemini multimodal
4. Feed the extracted text to the AI → fill missing structured fields and produce a **summary**.
5. Document links are listed on the detail page (we never host documents, only link to them).

**Decision point:** "OCR + separate AI" vs "feed the PDF/image directly to Gemini multimodal for
summary+fields in one call" — the former is more controlled/cheap, the latter simpler. To be
chosen with a volume/cost test.

---

## Build status

| Piece | Status |
|---|---|
| Scrape (5 sources) · Normalize · Publish gate · Index · Alert · Email · Status | ✅ |
| Scheduler trigger (12:00) | 🟡 scaffold |
| Cross-source dedup — Tier 1 (deterministic) | 🔴 |
| Cross-source dedup — Tier 2 (embedding + LLM) + pgvector | 🔴 |
| Classification gate (is it a tender?) | 🔴 |
| Download documents + PDF/Word/OCR | 🔴 |
| AI field extraction | 🔴 |
| AI translate + summary (Flash-Lite) | ✅ script (`translate-summarize.ts`); 🟡 as queued worker |
| Canonical selection + "also listed on" UI | 🔴 |

**The main thing to build — the "AI brain":** document/OCR → extraction+classification →
translation+summary, plus the two dedup tiers. The rest is built and tested with real data (~254 live tenders).

**Operational:** For regular runs it needs a deployed worker (Railway) + Redis (Upstash quota
exhausted; for now the backfill runs manually).
