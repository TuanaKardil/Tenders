# AI Prompts

All AI prompts live in this folder — one file per task — so they are easy to find,
review and edit without digging through code.

| File | Task | Used by |
|------|------|---------|
| `translate-summarize.ts` | Translate titles + write plain-language summaries (EN+TR) | `src/lib/ai.ts` → `src/scripts/translate-summarize.ts` |

Upcoming (per `docs/PIPELINE.md`): `classification.ts` (is it a tender?),
`extraction.ts` (structured fields from documents), `dedupe-judge.ts` (same tender?).

Editing a prompt: change the exported string, then re-run the relevant script
(e.g. `pnpm exec tsx --env-file=../../.env src/scripts/translate-summarize.ts 5 --all --dry`
to preview on 5 tenders without writing).
