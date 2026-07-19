import { eq, sql } from "drizzle-orm";
import { db, tenders, documents, sources } from "@repo/db";
import { fetchDetail } from "../scrapers/guinea";
import { statusFromClosingAt } from "../lib/normalize";

/**
 * One-off: enrich the EXISTING gn-jao tenders from their detail pages per the
 * source contract — closing_at, attachment links (documents rows), status.
 * Summaries/AI fields are NOT touched here (they re-run separately with the
 * new document text). Body text is never stored (yellow license).
 *
 * DRY by default (first N tenders, prints what was found); --apply writes.
 * Args: <N> limit (default all) · --apply
 */
const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => /^\d+$/.test(a));
const limit = limitArg ? Number(limitArg) : null;

async function main() {
  let rows = await db
    .select({ t: tenders })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(sources.slug, "gn-jao"));
  if (limit) rows = rows.slice(0, limit);

  console.log(`\n${apply ? "" : "[DRY] "}Guinea detail backfill — ${rows.length} tenders\n`);

  let withClosing = 0;
  let withDocs = 0;
  let totalDocs = 0;
  let failed = 0;
  const now = new Date();

  for (const { t } of rows) {
    try {
      const d = await fetchDetail(t.sourceUrl);
      const docN = d.documents.length;
      if (d.closing_at) withClosing++;
      if (docN > 0) withDocs++;
      totalDocs += docN;
      console.log(
        `  ${d.closing_at ? "📅 " + d.closing_at.slice(0, 10) : "—         "} ` +
          `docs:${String(docN).padStart(2)}  ${t.titleOriginal.slice(0, 62)}`
      );

      if (!apply) continue;

      // Tender fields: detail wins; never blank out existing values.
      const update: Record<string, unknown> = { updatedAt: now };
      if (d.closing_at) {
        const closingAt = new Date(d.closing_at);
        update.closingAt = closingAt;
        update.status = statusFromClosingAt(closingAt, now);
      }
      await db.update(tenders).set(update).where(eq(tenders.id, t.id));

      // Documents: insert new URLs only (idempotent re-runs).
      const existing = await db
        .select({ url: documents.url })
        .from(documents)
        .where(eq(documents.tenderId, t.id));
      const have = new Set(existing.map((e) => e.url));
      for (const doc of d.documents) {
        if (have.has(doc.url)) continue;
        await db.insert(documents).values({
          tenderId: t.id,
          title: doc.title ?? null,
          url: doc.url,
          fileType: doc.file_type ?? null,
        });
        have.add(doc.url);
      }
      const counted = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(documents)
        .where(eq(documents.tenderId, t.id));
      await db
        .update(tenders)
        .set({ documentsCount: counted[0]?.n ?? 0 })
        .where(eq(tenders.id, t.id));
    } catch (err) {
      failed++;
      console.log(`  ✗ ${(err as Error).message.slice(0, 80)}  ${t.titleOriginal.slice(0, 50)}`);
    }
  }

  console.log(
    `\n${apply ? "" : "[DRY] "}Summary: closing found ${withClosing}/${rows.length}, ` +
      `tenders w/ docs ${withDocs}/${rows.length}, total document links ${totalDocs}, failed ${failed}`
  );
  if (!apply) console.log(`[DRY] Nothing written. Re-run with --apply after approval.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
