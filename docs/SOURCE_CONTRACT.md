# Source Contract — checklist for adding a new source

Every scraper is different (JSON API, HTML list, WordPress...), but every
scraper's OUTPUT follows one contract, defined in
`packages/config/src/source-contract.ts`. Use this checklist when adding a
source; `apps/worker/src/scrapers/guinea.ts` is the reference implementation.

**Required** (always filled): `source_notice_id`, `source_url`, original
title, `country` (ISO2), `language`, `published_at` (first-seen fallback).
**Expected** (null only when the source truly doesn't have it): buyer name,
`closing_at`, raw notice type, `documents[]` with absolute URLs.

Rules that prevent repeat mistakes:

1. **Check the detail page before shipping.** If the list page lacks closing
   dates or attachments but the detail page has them, set
   `requiresDetailFetch: true` in the scraper's `SOURCE_CONFIG` and implement
   `fetchDetail(url)`. A field counts as null only when it exists on NEITHER
   page; when both have it, the detail page wins. The /admin/kapsam page
   flags any source with document coverage below 20% — that amber warning
   usually means this step was skipped.
2. **License red line.** The notice body is never stored in full — at most a
   300-character snippet (`DESCRIPTION_SNIPPET_MAX`). Linking attachments is
   fine on every license class; their text is extracted in pipeline stage 4
   and the file discarded. This is what "yellow / metadata-only" means in
   practice.
3. **Be polite.** Detail crawls go through `politeFetchHtml` (≥500ms between
   same-domain requests, backoff on 429/503). Only fetch notices inside the
   recency window (7 days; first backfill may widen).
4. **Register properly.** Add the source to `REAL_SOURCES` (with the correct
   `license`) and `ADAPTERS` in `backfill.ts`; if it supplies documents, also
   to `backfill-documents.ts`. Raw notice-type phrases need no dictionary
   work — the self-growing dictionary learns them (unknowns land in
   /admin/sozluk).

Existing scrapers (Kenya, TED, Uganda, UNGM, Ethiopia) predate the contract
and are NOT being refactored while they work; migrate them opportunistically
when they next need changes.
