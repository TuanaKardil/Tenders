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

// ---------------------------------------------------------------------------
// Two-path alert matching: keyword (Meili) ∪ semantic (embeddings).

import { inArray } from "drizzle-orm";
import { tenderEmbeddings } from "@repo/db";
import { SEMANTIC_ALERT_THRESHOLD } from "@repo/config/alerts";
import { TENDERS_INDEX, buildMeiliFilter, type TenderDoc } from "@repo/config";
import { getMeili } from "../meili";
import { cosine } from "./embeddings";

export type MatchType = "keyword" | "semantic" | "both";

export interface MatchResult {
  hits: TenderDoc[];
  /** tender id → how it matched. */
  matchTypes: Record<string, MatchType>;
  totalKeyword: number;
}

/**
 * Match one saved search against the index.
 * Path A (keyword): the existing Meili query — filters + q.
 * Path B (semantic): the SAME hard filters (country/date/etc. via Meili with
 * an empty q — never semantically bypassed), then cosine(search, tender)
 * ≥ SEMANTIC_ALERT_THRESHOLD on the candidates.
 * Union, labelled keyword | semantic | both.
 */
export async function matchSavedSearch(
  query: SavedSearchQuery,
  lastRunAt: Date | null,
  searchEmbedding: number[] | null
): Promise<MatchResult> {
  const index = getMeili().index<TenderDoc>(TENDERS_INDEX);
  const filters = queryToFilters(query, lastRunAt);
  const meiliFilter = buildMeiliFilter(filters);

  // Path A — keyword.
  const kw = await index.search(filters.q ?? "", {
    filter: meiliFilter,
    limit: 20,
    sort: ["published_at:desc"],
  });
  const matchTypes: Record<string, MatchType> = {};
  const byId = new Map<string, TenderDoc>();
  for (const h of kw.hits) {
    matchTypes[h.id] = "keyword";
    byId.set(h.id, h);
  }

  // Path B — semantic, over hard-filtered candidates only.
  if (searchEmbedding) {
    const candidates = await index.search("", {
      filter: meiliFilter,
      limit: 200,
      sort: ["published_at:desc"],
    });
    const candById = new Map(candidates.hits.map((h) => [h.id, h]));
    const ids = [...candById.keys()];
    if (ids.length > 0) {
      const embs = await db
        .select({ id: tenderEmbeddings.tenderId, emb: tenderEmbeddings.embedding })
        .from(tenderEmbeddings)
        .where(inArray(tenderEmbeddings.tenderId, ids));
      for (const e of embs) {
        if (cosine(searchEmbedding, e.emb) < SEMANTIC_ALERT_THRESHOLD) continue;
        if (matchTypes[e.id]) {
          matchTypes[e.id] = "both";
        } else {
          matchTypes[e.id] = "semantic";
          byId.set(e.id, candById.get(e.id)!);
        }
      }
    }
  }

  return {
    hits: [...byId.values()],
    matchTypes,
    totalKeyword: kw.estimatedTotalHits ?? kw.hits.length,
  };
}
