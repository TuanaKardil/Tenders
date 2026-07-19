import { eq, sql } from "drizzle-orm";
import { db, tenders, documents, sources } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";
import { extractFields } from "../lib/ai";
import { mergeExtractedFields, joinDocTexts, CRITICAL_FIELDS } from "../lib/merge-tender";

/**
 * One-off (idempotent) merge backfill:
 *
 * Phase A — provenance seed. Existing rows predate field_provenance; infer it
 * conservatively: critical fields present since scrape (closing/published/
 * buyer/notice_type from API sources) → "source_page"; AI-era fields
 * (value/currency/eligibility) → "document" when the tender has document text,
 * else "ai_page_text". Only rows with an empty provenance map are touched.
 *
 * Phase B — recovery. Published tenders that HAVE extracted document text but
 * still have an empty critical field (closing/value/currency/eligibility) are
 * re-run through AI extraction + the single merge rule. Reports how many
 * fields were recovered, per source.
 *
 * DRY by default; --apply writes (and reindexes touched published tenders).
 */
const apply = process.argv.includes("--apply");
const DOC_CHAR_CAP = 100_000;

async function main() {
  // ---------- Phase A: provenance seed ----------
  const rows = await db
    .select({ t: tenders, sourceSlug: sources.slug })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id));

  const docCounts = new Map<string, number>();
  {
    const dc = await db
      .select({ id: documents.tenderId, n: sql<number>`count(*) filter (where extracted_text is not null)::int` })
      .from(documents)
      .groupBy(documents.tenderId);
    for (const d of dc) docCounts.set(d.id, d.n);
  }

  let seeded = 0;
  for (const { t } of rows) {
    if (Object.keys(t.fieldProvenance).length > 0) continue; // already stamped
    const hasDocs = (docCounts.get(t.id) ?? 0) > 0;
    const aiOrigin = hasDocs ? "document" : "ai_page_text";
    const p: Record<string, string> = {};
    if (t.closingAt) p.closing_at = t.noticeTypeRaw !== null || t.publishedAt ? "source_page" : aiOrigin;
    if (t.publishedAt) p.published_at = "source_page";
    if (t.buyerNameRaw) p.buyer = "source_page";
    if (t.noticeTypeRaw) p.notice_type = "source_page";
    if (t.estimatedValueMax) p.estimated_value = aiOrigin;
    if (t.currency) p.currency = aiOrigin;
    if (t.eligibilityNotesEn) p.eligibility = aiOrigin;
    if (Object.keys(p).length === 0) continue;
    seeded++;
    if (apply) {
      await db.update(tenders).set({ fieldProvenance: p }).where(eq(tenders.id, t.id));
      // Keep the in-memory row in sync — Phase B merges FROM this object, and
      // writing a stale (pre-seed) map back would silently erase the seed.
      t.fieldProvenance = p;
    }
  }
  console.log(`\n${apply ? "" : "[DRY] "}Phase A — provenance seeded on ${seeded} rows`);

  // ---------- Phase B: recovery ----------
  const targets = rows.filter(
    ({ t }) =>
      t.isPublished &&
      (docCounts.get(t.id) ?? 0) > 0 &&
      (t.closingAt === null || t.estimatedValueMax === null || t.currency === null || t.eligibilityNotesEn === null)
  );
  console.log(`Phase B — ${targets.length} published tenders with doc text + an empty critical field`);
  console.log(`  est cost: $${(targets.length * 0.003).toFixed(2)}`);

  if (!apply) {
    const bySrc = new Map<string, number>();
    for (const { sourceSlug } of targets) bySrc.set(sourceSlug, (bySrc.get(sourceSlug) ?? 0) + 1);
    for (const [s, n] of bySrc) console.log(`    ${s}: ${n}`);
    console.log(`\n[DRY] Nothing written. Re-run with --apply.`);
    process.exit(0);
  }

  const recovered: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const touched: typeof rows = [];
  let failed = 0;
  const now = new Date();

  for (const row of targets) {
    const { t, sourceSlug } = row;
    try {
      const docs = await db
        .select({ txt: documents.extractedText })
        .from(documents)
        .where(eq(documents.tenderId, t.id));
      const documentText = joinDocTexts(docs.map((d) => d.txt), DOC_CHAR_CAP);
      const { fields } = await extractFields({
        title: t.titleOriginal,
        description: null,
        documentText,
      });
      const before = {
        closingAt: t.closingAt,
        estimatedValueMax: t.estimatedValueMax,
        currency: t.currency,
        eligibilityNotesEn: t.eligibilityNotesEn,
        fieldProvenance: t.fieldProvenance,
      };
      const { update } = mergeExtractedFields(before, fields, documentText.length > 0, now);

      // Count actual recoveries (field went empty → filled).
      let got = 0;
      if (update.closingAt) { recovered.closing_at = (recovered.closing_at ?? 0) + 1; got++; }
      if (update.estimatedValueMax) { recovered.estimated_value = (recovered.estimated_value ?? 0) + 1; got++; }
      if (update.currency) { recovered.currency = (recovered.currency ?? 0) + 1; got++; }
      if (update.eligibilityNotesEn) { recovered.eligibility = (recovered.eligibility ?? 0) + 1; got++; }
      if (got > 0) bySource[sourceSlug] = (bySource[sourceSlug] ?? 0) + 1;

      update.updatedAt = now;
      await db.update(tenders).set(update).where(eq(tenders.id, t.id));
      Object.assign(t, update);
      touched.push(row);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${(err as Error).message.slice(0, 90)} — ${t.titleOriginal.slice(0, 50)}`);
    }
  }

  const srcRows = await db.select().from(sources);
  const srcBySlug = new Map(srcRows.map((s) => [s.slug, s]));
  const docsForMeili = touched
    .filter((r) => r.t.isPublished)
    .map((r) => tenderToDoc(r.t, srcBySlug.get(r.sourceSlug)!));
  if (docsForMeili.length) {
    await getMeili().index(TENDERS_INDEX).addDocuments(docsForMeili, { primaryKey: "id" });
  }

  console.log(`\nApplied. Recovered fields:`);
  for (const f of CRITICAL_FIELDS) {
    if (recovered[f]) console.log(`  ${f}: ${recovered[f]}`);
  }
  console.log(`Per source:`, JSON.stringify(bySource));
  console.log(`${failed} failed, ${docsForMeili.length} reindexed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
