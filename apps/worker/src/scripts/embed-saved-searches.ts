import { db, savedSearches } from "@repo/db";
import { ensureSearchEmbedding, searchEmbeddingText } from "../lib/alerts";

/**
 * Backfill: embed every saved search that has embeddable text and a missing
 * or stale embedding (embedding_updated_at < updated_at). Idempotent — the
 * daily alert run also embeds lazily; this is for the existing backlog.
 * Cost: AI Studio free tier ($0).
 */
async function main() {
  const rows = await db.select().from(savedSearches);
  let embedded = 0;
  let skippedNoText = 0;
  let fresh = 0;

  for (const s of rows) {
    if (!searchEmbeddingText(s.query)) {
      skippedNoText++;
      continue;
    }
    const had =
      s.embedding !== null && s.embeddingUpdatedAt !== null && s.embeddingUpdatedAt >= s.updatedAt;
    const vec = await ensureSearchEmbedding(s);
    if (vec && !had) embedded++;
    else if (had) fresh++;
  }

  console.log(
    `Saved searches: ${rows.length} total — ${embedded} embedded, ${fresh} already fresh, ${skippedNoText} without embeddable text (country/date-only filters).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
