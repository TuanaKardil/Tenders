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
