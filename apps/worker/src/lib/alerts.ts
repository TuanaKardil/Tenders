import type { SavedSearchQuery } from "@repo/db/schema";
import type { SearchFilters } from "@repo/config/search";

/**
 * saved_searches.query jsonb -> Meilisearch filters.
 * lastRunAt bounds matching to tenders published since the previous alert.
 */
export function queryToFilters(
  query: SavedSearchQuery,
  lastRunAt: Date | null
): SearchFilters {
  return {
    q: query.q,
    countries: query.countries,
    sectors: query.sectors,
    status: query.status,
    sources: query.sources,
    valueMin: query.valueMin,
    valueMax: query.valueMax,
    closingBefore: query.closingBefore,
    publishedAfterUnix: lastRunAt
      ? Math.floor(lastRunAt.getTime() / 1000)
      : undefined,
  };
}

/** /search URL for a saved search — used as the email CTA target. */
export function searchUrlFor(query: SavedSearchQuery, appUrl: string): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.countries?.length) params.set("country", query.countries.join(","));
  if (query.sectors?.length) params.set("sector", query.sectors.join(","));
  if (query.status?.length) params.set("status", query.status.join(","));
  if (query.sources?.length) params.set("source", query.sources.join(","));
  const qs = params.toString();
  return `${appUrl}/search${qs ? `?${qs}` : ""}`;
}

// ---------------------------------------------------------------------------
// Semantic alert matching — saved-search embeddings.

import { SECTORS } from "@repo/config/constants";
import { eq } from "drizzle-orm";
import { db, savedSearches } from "@repo/db";
import { embedTexts } from "./embeddings";

const SECTOR_EN = new Map<string, string>(SECTORS.map((s) => [s.slug, s.en]));

/**
 * The text a saved search embeds: free-text query + sector names.
 * Country/date/value are HARD filters — they never enter the embedding.
 */
export function searchEmbeddingText(query: SavedSearchQuery): string {
  const parts: string[] = [];
  if (query.q?.trim()) parts.push(query.q.trim());
  for (const slug of query.sectors ?? []) {
    const en = SECTOR_EN.get(slug);
    if (en) parts.push(en);
  }
  return parts.join(". ");
}

/**
 * Ensure a saved search has a fresh embedding (created/criteria-changed
 * searches re-embed lazily on the next alert run). Returns the vector, or
 * null when the search has no embeddable text.
 */
export async function ensureSearchEmbedding(search: {
  id: string;
  query: SavedSearchQuery;
  embedding: number[] | null;
  embeddingUpdatedAt: Date | null;
  updatedAt: Date;
}): Promise<number[] | null> {
  const text = searchEmbeddingText(search.query);
  if (!text) return null;
  const fresh =
    search.embedding !== null &&
    search.embeddingUpdatedAt !== null &&
    search.embeddingUpdatedAt >= search.updatedAt;
  if (fresh) return search.embedding;
  const [vec] = await embedTexts([text]);
  await db
    .update(savedSearches)
    .set({ embedding: vec, embeddingUpdatedAt: new Date() })
    .where(eq(savedSearches.id, search.id));
  return vec ?? null;
}
