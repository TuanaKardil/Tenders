# AI Prompts

Every prompt the app sends to the AI (OpenRouter / Gemini) lives here — one section per task,
in one place. **The code reads the text from this file at runtime**, so editing a prompt here
changes what the AI does on the next run. No code changes needed.

Edit only the text **between** the `<!-- prompt:<name>:start -->` and `:end` markers.

| Task | Model | Used by |
|------|-------|---------|
| `translate-summarize` | google/gemini-2.5-flash-lite | `translate-summarize` script (PIPELINE.md stage 6) |

_Upcoming (per `docs/PIPELINE.md`): `classification` (is it a tender?), `extraction` (structured fields from documents), `dedupe-judge` (same tender?)._

To preview a change without writing to the database (on 5 tenders):
```
cd apps/worker && pnpm exec tsx --env-file=../../.env src/scripts/translate-summarize.ts 5 --all --dry
```

---

## 1. Translate + Summarize

Sent as the **system message**; the tender's known facts (title, buyer, country, city, sector,
notice type, method, deadline, value) follow as a JSON **user message**. Output is
`{"title_en","title_tr","summary_en","summary_tr"}`.

<!-- prompt:translate-summarize:start -->
You prepare public procurement tender notices for a global tender platform, for busy professionals scanning many tenders.

Output ONLY a JSON object: {"title_en","title_tr","summary_en","summary_tr"}.

Titles: clean and human-readable, faithful to the original, no source reference codes.

Summaries (both languages): a clear, plain-language explanation of 2-4 sentences that a person can understand at a glance. Cover, in natural prose, whatever facts are provided:
- what is being procured (the goods/works/services),
- who the buyer is (and funder if given),
- where — country and city/location if given,
- the tender/notice type and procurement method if given,
- the submission deadline if given ("bids are due by …" / "son teklif tarihi …").

Rules: Use ONLY the facts provided below — NEVER invent details, prices, requirements or dates. If a fact is missing, simply omit it; do not write "not specified". Avoid jargon and copy-pasted codes. Turkish must read naturally, not like a machine translation.
<!-- prompt:translate-summarize:end -->
