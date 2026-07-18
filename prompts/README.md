# AI Prompts

Every prompt the app sends to the AI lives in this folder — **one file per task**.
Each `.md` file **is** the prompt (its whole content is sent to the model). Edit a file here
and the change takes effect on the next run — **no code change needed**; the code reads these
files at runtime.

| File | Task | Model | Used by |
|------|------|-------|---------|
| `translate-summarize.md` | Translate titles + write plain-language summaries (EN+TR) | google/gemini-2.5-flash-lite | `apps/worker/src/scripts/translate-summarize.ts` (PIPELINE.md stage 6) |
| `classification.md` | Is this an open tender (vs award/disposal/vacancy/news)? AI tier of the classification gate — only ambiguous notices reach it; clear cases are decided by cheap rules first | google/gemini-2.5-flash-lite | `apps/worker/src/scripts/classify.ts` (PIPELINE.md stage 5) |
| `document-ocr.md` | Transcribe raw text from an image or scanned/text-less PDF (verbatim, no translation). Only reached when pdf-parse/mammoth can't (images, scans) | google/gemini-2.5-flash | `apps/worker/src/scripts/extract-documents.ts` (PIPELINE.md stage 4) |
| `field-extraction.md` | Structured fields (value, currency, sector, CPV, eligibility, notice type + confidence) from title + description + document text. Forbids guessing — missing fields stay null | google/gemini-2.5-flash-lite | `apps/worker/src/scripts/extract-fields.ts` (PIPELINE.md stage 5) |
| `dedupe-judge.md` | Are two similar notices the SAME tender on two portals, or different tenders? Leans NO on doubt (never hide a real tender). Only pairs with embedding similarity ≥ 0.85 reach it | google/gemini-2.5-flash-lite | `apps/worker/src/scripts/dedupe-tier2.ts` (PIPELINE.md stage 7) |
| `notice-type-learn.md` | Classify an unknown raw notice-type label (any language) into the canonical enum — feeds the self-growing dictionary. Confidence ≥ 0.8 becomes an active mapping; below goes to admin review (/admin/sozluk) | google/gemini-2.5-flash-lite | `apps/worker/src/lib/notice-type-resolver.ts` |

_Upcoming (per `docs/PIPELINE.md`): `seo.md` (SEO copy)._

## How a prompt is used
The file's text is sent as the **system message**; the tender's facts (title, buyer, country,
city, sector, notice type, method, deadline, value) follow as a JSON **user message**.

## Preview a change without writing to the DB (on 5 tenders)
```
cd apps/worker && pnpm exec tsx --env-file=../../.env src/scripts/translate-summarize.ts 5 --all --dry
```
Then re-run without `--dry` to apply to all tenders (also reindexes Meilisearch).
