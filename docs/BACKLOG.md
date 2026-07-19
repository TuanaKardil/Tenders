# Backlog

Deferred work, picked up as separate rounds after current fixes land.

## Sources → source-contract migration (detail-page + document fetch)

UNGM, Uganda (ug-egp) and Ethiopia (et-egp) currently have **0 document
coverage** — not "no documents", but "we don't fetch their detail pages yet".
Migrate each to the source contract the way Guinea (gn-jao) was done:
`SOURCE_CONFIG.requiresDetailFetch = true` + a `fetchDetail(url)` that pulls
closing date, buyer and document links from the detail page (≤300-char body
snippet, polite 500ms fetch). Add each to `DETAIL_FETCH_SOURCES` so the
coverage counter, anomaly alarm and spot-check audit start covering it.

Order: after the current admin-panel fixes; one source per round, each with
its own DRY → approval → apply and a before/after coverage report.
