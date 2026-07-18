import { eq } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { type NoticeType } from "@repo/config/constants";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";
import { createNoticeTypeResolver } from "../lib/notice-type-resolver";
import { learnNoticeType } from "../lib/ai";

/**
 * Backfill: recompute tenders.notice_type (enum) from notice_type_raw through
 * the self-growing dictionary (DB mappings → static fallback → AI learning).
 *
 * DRY by default: prints the enum distribution, the phrases that WOULD go to
 * the AI learner together with the AI's suggestion (nothing stored), then
 * STOPS. --apply resolves for real (mappings get written, tenders updated,
 * published rows reindexed so the notice_type facet stays fresh).
 */
const apply = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id));

  const resolver = createNoticeTypeResolver({ dry: !apply });
  const counts = new Map<NoticeType, number>();
  const changes: { id: string; nt: NoticeType }[] = [];

  for (const { t, source } of rows) {
    const nt = await resolver.resolve(t.noticeTypeRaw, source.slug, t.languageOriginal);
    counts.set(nt, (counts.get(nt) ?? 0) + 1);
    if (nt !== t.noticeType) changes.push({ id: t.id, nt });
  }

  const r = resolver.report;
  console.log(`\n${apply ? "" : "[DRY] "}Notice-type normalization over ${rows.length} tenders`);
  for (const [nt, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${nt.padEnd(16)} ${n}`);
  }
  console.log(
    `  resolution — db: ${r.dbHits}, static: ${r.staticHits}, pending-skip: ${r.pendingSkipped}, changed rows: ${changes.length}`
  );

  if (!apply) {
    if (r.wouldLearn.length === 0) {
      console.log(`\n  No unknown phrases — nothing would go to the AI learner.`);
    } else {
      console.log(`\n  ${r.wouldLearn.length} phrase(s) would go to the AI learner (preview, NOT stored):`);
      for (const w of r.wouldLearn) {
        try {
          const s = await learnNoticeType(w.raw, w.source);
          const dest = s.confidence >= 0.8 ? "→ active" : "→ pending review";
          console.log(
            `    [${w.source}] "${w.raw}" ⇒ ${s.enum} (conf ${s.confidence.toFixed(2)}) ${dest} — ${s.reasoning.slice(0, 60)}`
          );
        } catch {
          console.log(`    [${w.source}] "${w.raw}" ⇒ (AI preview failed)`);
        }
      }
    }
    console.log(`\n[DRY] Nothing written. Re-run with --apply after approval.`);
    process.exit(0);
  }

  // --apply: write changed enums + report learning, then refresh Meili facet.
  for (const c of changes) {
    await db.update(tenders).set({ noticeType: c.nt }).where(eq(tenders.id, c.id));
  }
  if (r.aiLearnedActive.length) {
    console.log(`\n  AI learned (active):`);
    for (const l of r.aiLearnedActive)
      console.log(`    [${l.source}] "${l.raw}" ⇒ ${l.enum} (conf ${l.confidence.toFixed(2)})`);
  }
  if (r.aiPending.length) {
    console.log(`\n  AI unsure (pending admin review at /admin/sozluk):`);
    for (const l of r.aiPending)
      console.log(`    [${l.source}] "${l.raw}" ⇒ ${l.enum}? (conf ${l.confidence.toFixed(2)})`);
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
  console.log(
    `\nApplied: ${changes.length} notice_type updates, ${r.aiLearnedActive.length} learned, ${r.aiPending.length} pending, ${published.length} reindexed.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
