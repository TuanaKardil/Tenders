import "server-only";
import { Meilisearch } from "meilisearch";
import {
  TENDERS_INDEX,
  buildMeiliFilter,
  type SearchFilters,
  type TenderDoc,
} from "@repo/config/search";

let client: Meilisearch | undefined;

function getMeili(): Meilisearch {
  if (!client) {
    const host = process.env.MEILISEARCH_HOST;
    // Search-only key is enough for the web app.
    const apiKey =
      process.env.MEILISEARCH_SEARCH_KEY ?? process.env.MEILISEARCH_ADMIN_KEY;
    if (!host || !apiKey) {
      throw new Error("MEILISEARCH_HOST / MEILISEARCH_SEARCH_KEY are not set");
    }
    client = new Meilisearch({ host, apiKey });
  }
  return client;
}

export interface TenderSearchResult {
  hits: TenderDoc[];
  totalHits: number;
  page: number;
  totalPages: number;
  processingTimeMs: number;
  facets: {
    country: Record<string, number>;
    sector_primary: Record<string, number>;
    status: Record<string, number>;
    source_slug: Record<string, number>;
  };
}

const HITS_PER_PAGE = 20;

export async function searchTenders(
  filters: SearchFilters,
  page = 1
): Promise<TenderSearchResult> {
  const index = getMeili().index<TenderDoc>(TENDERS_INDEX);
  const result = await index.search(filters.q ?? "", {
    filter: buildMeiliFilter(filters),
    facets: ["country", "sector_primary", "status", "source_slug"],
    hitsPerPage: HITS_PER_PAGE,
    page,
    sort: filters.q ? undefined : ["published_at:desc"],
  });

  return {
    hits: result.hits,
    totalHits: result.totalHits ?? 0,
    page: result.page ?? page,
    totalPages: result.totalPages ?? 0,
    processingTimeMs: result.processingTimeMs,
    facets: {
      country: result.facetDistribution?.country ?? {},
      sector_primary: result.facetDistribution?.sector_primary ?? {},
      status: result.facetDistribution?.status ?? {},
      source_slug: result.facetDistribution?.source_slug ?? {},
    },
  };
}

/** Similar tenders: same sector + country, excluding the tender itself. */
export async function similarTenders(
  doc: Pick<TenderDoc, "id" | "country" | "sector_primary" | "title_en">,
  limit = 4
): Promise<TenderDoc[]> {
  const index = getMeili().index<TenderDoc>(TENDERS_INDEX);
  const parts = [`id != "${doc.id}"`, 'status IN ["open", "closing_soon"]'];
  if (doc.sector_primary) parts.push(`sector_primary = "${doc.sector_primary}"`);
  const result = await index.search(doc.title_en, {
    filter: parts.join(" AND "),
    limit,
  });
  return result.hits;
}

/** Country → published tender count, for the map and stat counters. */
export async function countryFacetCounts(): Promise<Record<string, number>> {
  const index = getMeili().index<TenderDoc>(TENDERS_INDEX);
  const result = await index.search("", {
    facets: ["country"],
    limit: 0,
  });
  return result.facetDistribution?.country ?? {};
}
