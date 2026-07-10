/**
 * Applies index settings and optionally triggers a full reindex.
 * Usage: tsx src/scripts/meili-setup.ts [--reindex]
 */
import { TENDERS_INDEX, TENDERS_INDEX_SETTINGS } from "@repo/config/search";
import { getMeili } from "../meili";
import { fullReindex } from "../workers/index-sync";

async function main() {
  const meili = getMeili();

  await meili.createIndex(TENDERS_INDEX, { primaryKey: "id" }).catch(() => {
    // index_already_exists is fine
  });
  const index = meili.index(TENDERS_INDEX);
  const task = await index.updateSettings({
    ...TENDERS_INDEX_SETTINGS,
    searchableAttributes: [...TENDERS_INDEX_SETTINGS.searchableAttributes],
    filterableAttributes: [...TENDERS_INDEX_SETTINGS.filterableAttributes],
    sortableAttributes: [...TENDERS_INDEX_SETTINGS.sortableAttributes],
    rankingRules: [...TENDERS_INDEX_SETTINGS.rankingRules],
    typoTolerance: {
      minWordSizeForTypos: {
        ...TENDERS_INDEX_SETTINGS.typoTolerance.minWordSizeForTypos,
      },
    },
    synonyms: Object.fromEntries(
      Object.entries(TENDERS_INDEX_SETTINGS.synonyms).map(([k, v]) => [k, [...v]])
    ),
  });
  console.log(`settings task ${task.taskUid} enqueued`);

  if (process.argv.includes("--reindex")) {
    const result = await fullReindex();
    console.log(`full reindex: ${JSON.stringify(result)}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
