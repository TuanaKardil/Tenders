# AI Prompts

Every prompt the app sends to the AI lives in this folder — **one file per task**.
Each `.md` file **is** the prompt (its whole content is sent to the model). Edit a file here
and the change takes effect on the next run — **no code change needed**; the code reads these
files at runtime.

| File | Task | Model | Used by |
|------|------|-------|---------|
| `translate-summarize.md` | Translate titles + write plain-language summaries (EN+TR) | google/gemini-2.5-flash-lite | `apps/worker/src/scripts/translate-summarize.ts` (PIPELINE.md stage 6) |

_Upcoming (per `docs/PIPELINE.md`): `classification.md` (is it a tender?), `extraction.md`
(structured fields from documents), `dedupe-judge.md` (same tender?), `seo.md` (SEO copy)._

## How a prompt is used
The file's text is sent as the **system message**; the tender's facts (title, buyer, country,
city, sector, notice type, method, deadline, value) follow as a JSON **user message**.

## Preview a change without writing to the DB (on 5 tenders)
```
cd apps/worker && pnpm exec tsx --env-file=../../.env src/scripts/translate-summarize.ts 5 --all --dry
```
Then re-run without `--dry` to apply to all tenders (also reindexes Meilisearch).
