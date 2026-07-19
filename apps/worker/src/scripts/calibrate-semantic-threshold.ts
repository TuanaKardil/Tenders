import { eq } from "drizzle-orm";
import { db, tenders, tenderEmbeddings, sources } from "@repo/db";
import { SEMANTIC_ALERT_THRESHOLD } from "@repo/config/alerts";
import { embedTexts, cosine } from "../lib/embeddings";

/**
 * Threshold calibration for semantic alert matching. Embeds sample queries
 * (Turkish, deliberately — users write alerts in their own language) and
 * scores them against every tender embedding. Prints the top-10 per query so
 * the founder can decide where the "relevant" line sits.
 *
 * Includes the narrow-vs-broad pair (ultrasound device vs medical equipment)
 * to show how specificity affects scores. Read-only — writes nothing.
 */
const QUERIES = [
  "ameliyat ekipmanları",
  "solar enerji",
  "yol yapımı",
  "bilgisayar donanımı",
  "danışmanlık hizmeti",
  // narrow vs broad pair:
  "ultrason cihazı",
  "medikal ekipman",
];

async function main() {
  const rows = await db
    .select({
      id: tenders.id,
      title: tenders.titleEn,
      titleOrig: tenders.titleOriginal,
      country: tenders.country,
      slug: sources.slug,
      emb: tenderEmbeddings.embedding,
    })
    .from(tenders)
    .innerJoin(tenderEmbeddings, eq(tenderEmbeddings.tenderId, tenders.id))
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(tenders.isPublished, true));

  console.log(`\nCalibration over ${rows.length} published tenders (current threshold: ${SEMANTIC_ALERT_THRESHOLD})`);

  const vectors = await embedTexts(QUERIES);

  for (let i = 0; i < QUERIES.length; i++) {
    const qv = vectors[i]!;
    const scored = rows
      .map((r) => ({ r, sim: cosine(qv, r.emb) }))
      .sort((a, b) => b.sim - a.sim);

    const above = scored.filter((s) => s.sim >= SEMANTIC_ALERT_THRESHOLD).length;
    console.log(`\n━━ "${QUERIES[i]}" — eşik üstü (${SEMANTIC_ALERT_THRESHOLD}): ${above} ihale`);
    for (const { r, sim } of scored.slice(0, 10)) {
      const marker = sim >= SEMANTIC_ALERT_THRESHOLD ? "✓" : "·";
      console.log(
        `  ${marker} ${sim.toFixed(3)} [${r.slug}|${r.country}] ${(r.title ?? r.titleOrig).slice(0, 72)}`
      );
    }
  }

  console.log(`\nRead-only: nothing written. Set the final threshold in packages/config/src/alerts.ts.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
