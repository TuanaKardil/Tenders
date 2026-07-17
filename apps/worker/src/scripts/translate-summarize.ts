import { desc, eq, isNull } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";
import { translateSummarize } from "../lib/ai";

/**
 * Redis-free translate + summarize backfill (PIPELINE.md stage 6).
 * Usage:
 *   tsx --env-file=../../.env src/scripts/translate-summarize.ts <limit> [--dry]
 * --dry prints results without writing to the DB or Meili (for a quick preview).
 */
const args = process.argv.slice(2);
const limit = Number(args.find((a) => /^\d+$/.test(a)) ?? 5) || 5;
const dry = args.includes("--dry");

async function main() {
  const rows = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(isNull(tenders.titleTr))
    .orderBy(desc(tenders.firstSeenAt))
    .limit(limit);

  console.log(`${dry ? "[DRY] " : ""}Processing ${rows.length} tender(s), model gemini-2.5-flash-lite...\n`);

  const done: { t: typeof tenders.$inferSelect; source: typeof sources.$inferSelect }[] = [];

  for (const { t, source } of rows) {
    try {
      const out = await translateSummarize({
        title: t.titleOriginal,
        language: t.languageOriginal,
        description: t.summaryEn,
        buyer: t.buyerNameRaw,
        country: t.country,
        sector: t.sectorPrimary,
      });

      console.log(`── [${source.slug}] ${t.country} (${t.languageOriginal})`);
      console.log(`   ORIG : ${t.titleOriginal.slice(0, 100)}`);
      console.log(`   EN   : ${out.title_en}`);
      console.log(`   TR   : ${out.title_tr}`);
      console.log(`   SUM EN: ${out.summary_en.slice(0, 180)}`);
      console.log(`   SUM TR: ${out.summary_tr.slice(0, 180)}\n`);

      if (!dry) {
        await db
          .update(tenders)
          .set({
            titleEn: out.title_en,
            titleTr: out.title_tr,
            summaryEn: out.summary_en,
            summaryTr: out.summary_tr,
            updatedAt: new Date(),
          })
          .where(eq(tenders.id, t.id));
        done.push({
          t: { ...t, titleEn: out.title_en, titleTr: out.title_tr, summaryEn: out.summary_en, summaryTr: out.summary_tr },
          source,
        });
      }
    } catch (err) {
      console.error(`   FAILED ${t.id}: ${(err as Error).message}\n`);
    }
  }

  if (!dry) {
    const docs = done.filter((d) => d.t.isPublished).map((d) => tenderToDoc(d.t, d.source));
    if (docs.length > 0) {
      await getMeili().index(TENDERS_INDEX).addDocuments(docs, { primaryKey: "id" });
      console.log(`Reindexed ${docs.length} tender(s) into Meilisearch (TR search updated).`);
    }
    console.log(`\nDone. ${done.length} translated + summarized.`);
  } else {
    console.log("[DRY] nothing written. Re-run without --dry to apply.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
