import { eq, sql } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { normalizeNoticeType } from "@repo/config/notice-type";
import { type NoticeType } from "@repo/config/constants";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";

/**
 * Backfill: recompute tenders.notice_type (enum) from notice_type_raw using the
 * central @repo/config normalizeNoticeType(). Pure dictionary — no AI, no Redis.
 *
 * DRY by default: prints an enum → count table plus the unmapped ("unknown")
 * rows, then STOPS. Re-run with --apply to write. On --apply, published rows
 * are re-pushed to Meilisearch so the notice_type facet stays correct.
 */
const apply = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id));

  const counts = new Map<NoticeType, number>();
  const unknowns: { slug: string; raw: string | null; title: string }[] = [];
  const changes: { id: string; nt: NoticeType; source: typeof sources.$inferSelect }[] = [];

  for (const { t, source } of rows) {
    const nt = normalizeNoticeType(t.noticeTypeRaw, source.slug);
    counts.set(nt, (counts.get(nt) ?? 0) + 1);
    if (nt === "unknown") {
      unknowns.push({ slug: source.slug, raw: t.noticeTypeRaw, title: t.titleOriginal });
    }
    changes.push({ id: t.id, nt, source });
  }

  console.log(`\n${apply ? "" : "[DRY] "}Notice-type normalization over ${rows.length} tenders`);
  const order: NoticeType[] = [
    "tender", "rfp", "rfq", "eoi", "prequalification",
    "award", "cancellation", "disposal", "vacancy", "unknown",
  ];
  for (const nt of order) {
    const n = counts.get(nt) ?? 0;
    if (n > 0) console.log(`  ${nt.padEnd(16)} ${n}`);
  }

  if (unknowns.length > 0) {
    console.log(`\n  "unknown" (mapped to nothing — will reach the AI classifier):`);
    for (const u of unknowns) {
      console.log(`    [${u.slug}] raw=${JSON.stringify(u.raw)} — ${u.title.slice(0, 70)}`);
    }
  }

  if (!apply) {
    console.log(`\n[DRY] Nothing written. After approval, re-run with --apply.`);
    process.exit(0);
  }

  // --apply: write the enum, then reindex published rows so the facet is fresh.
  for (const c of changes) {
    await db.update(tenders).set({ noticeType: c.nt }).where(eq(tenders.id, c.id));
  }

  const published = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(tenders.isPublished, true));
  if (published.length > 0) {
    const docs = published.map(({ t, source }) => tenderToDoc(t, source));
    await getMeili().index(TENDERS_INDEX).addDocuments(docs, { primaryKey: "id" });
  }

  console.log(`\nApplied: ${changes.length} notice_type values written, ${published.length} reindexed in Meilisearch.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
