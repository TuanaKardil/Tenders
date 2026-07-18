import { sql } from "drizzle-orm";
import { db, noticeTypeMappings } from "@repo/db";
import { NOTICE_TYPE_STATIC_DICT } from "@repo/config/notice-type";

/**
 * One-off: seed the static in-code notice-type dictionary into the
 * notice_type_mappings table (origin='static', status='active',
 * confidence=1.0). Idempotent — existing (source_slug, raw_text) rows are
 * left untouched, so re-running never overwrites AI/human entries.
 */
async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const [sourceSlug, dict] of Object.entries(NOTICE_TYPE_STATIC_DICT)) {
    for (const [rawText, mappedEnum] of Object.entries(dict)) {
      const res = await db
        .insert(noticeTypeMappings)
        .values({
          sourceSlug,
          rawText,
          mappedEnum,
          confidence: 1,
          origin: "static",
          status: "active",
        })
        .onConflictDoNothing();
      if ((res as { rowCount?: number }).rowCount === 0) skipped++;
      else inserted++;
    }
  }

  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(noticeTypeMappings)) as [{ n: number }];
  console.log(`Seeded: ${inserted} inserted, ${skipped} already present. Table now: ${n} mappings.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
