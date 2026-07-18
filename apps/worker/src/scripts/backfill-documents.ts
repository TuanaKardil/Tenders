import { and, eq, sql } from "drizzle-orm";
import { db, tenders, documents, sources } from "@repo/db";
import type { IngestNotice } from "@repo/config/ingest";
import { fetchKenya } from "../scrapers/kenya";
import { fetchTed } from "../scrapers/ted";

/**
 * Populate the documents table with attachment URLs for EXISTING tenders.
 * Non-destructive: it never touches tender rows — it re-fetches each source's
 * list, matches notices to tenders by (source_id, source_notice_id), and
 * inserts any new document URLs. Only sources whose list response carries
 * document links are wired here (Kenya documents[], TED links.pdf).
 *
 * DRY by default (reports what it would insert); --apply writes.
 *
 * This only stores URLs — text extraction is a separate step (extract-documents.ts).
 */
const apply = process.argv.includes("--apply");

// Sources whose list payload exposes document URLs (no per-notice detail fetch).
const ADAPTERS: Record<string, () => Promise<IngestNotice[]>> = {
  "ke-ppip": fetchKenya,
  "ted-eu": fetchTed,
};

async function main() {
  let totalNew = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;

  for (const [slug, adapter] of Object.entries(ADAPTERS)) {
    const [source] = await db.select().from(sources).where(eq(sources.slug, slug)).limit(1);
    if (!source) {
      console.log(`  ${slug}: source not registered — skip`);
      continue;
    }

    let notices: IngestNotice[] = [];
    try {
      notices = await adapter();
    } catch (err) {
      console.log(`  ${slug}: fetch failed — ${(err as Error).message}`);
      continue;
    }

    let srcNew = 0;
    let srcWithDocs = 0;
    let srcMatched = 0;
    let srcUnmatched = 0;

    for (const n of notices) {
      if (!n.documents?.length) continue;
      srcWithDocs++;

      const [tender] = await db
        .select({ id: tenders.id })
        .from(tenders)
        .where(and(eq(tenders.sourceId, source.id), eq(tenders.sourceNoticeId, n.source_notice_id)))
        .limit(1);
      if (!tender) {
        srcUnmatched++;
        continue;
      }
      srcMatched++;

      // Existing URLs for this tender, so re-runs don't duplicate.
      const existing = await db
        .select({ url: documents.url })
        .from(documents)
        .where(eq(documents.tenderId, tender.id));
      const have = new Set(existing.map((d) => d.url));

      for (const doc of n.documents) {
        if (have.has(doc.url)) continue;
        srcNew++;
        if (apply) {
          await db.insert(documents).values({
            tenderId: tender.id,
            title: doc.title ?? null,
            url: doc.url,
            fileType: doc.file_type ?? null,
          });
        }
        have.add(doc.url);
      }

      if (apply) {
        const counted = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(documents)
          .where(eq(documents.tenderId, tender.id));
        await db
          .update(tenders)
          .set({ documentsCount: counted[0]?.n ?? 0 })
          .where(eq(tenders.id, tender.id));
      }
    }

    console.log(
      `  ${slug.padEnd(10)} notices w/ docs: ${srcWithDocs} | matched tenders: ${srcMatched} | unmatched: ${srcUnmatched} | new document rows: ${srcNew}`
    );
    totalNew += srcNew;
    totalMatched += srcMatched;
    totalUnmatched += srcUnmatched;
  }

  console.log(
    `\n${apply ? "" : "[DRY] "}Total: ${totalNew} new document rows across ${totalMatched} tenders (${totalUnmatched} notices had no matching tender).`
  );
  if (!apply) console.log(`[DRY] Nothing written. Re-run with --apply to insert.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
