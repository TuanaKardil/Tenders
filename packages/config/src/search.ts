/** Meilisearch index name, document shape, settings, and filter building. */

export const TENDERS_INDEX = "tenders";

/** Flattened tender projection stored in Meilisearch. */
export interface TenderDoc {
  id: string;
  slug: string;
  title_en: string;
  title_tr: string | null;
  title_original: string;
  summary_en: string | null;
  summary_tr: string | null;
  buyer_name: string | null;
  funder_name: string | null;
  keywords: string[];
  cpv_codes: string[];
  country: string;
  region: string | null;
  city: string | null;
  sector_primary: string | null;
  sectors_secondary: string[];
  status: string;
  source_slug: string;
  language_original: string;
  notice_type: string | null;
  procurement_method: string | null;
  /** Unix seconds; null when unknown. */
  published_at: number | null;
  closing_at: number | null;
  value_usd_est: number | null;
  has_documents: boolean;
  quality_score: number;
}

export const TENDERS_INDEX_SETTINGS = {
  searchableAttributes: [
    "title_en",
    "title_original",
    "title_tr",
    "keywords",
    "buyer_name",
    "summary_en",
    "summary_tr",
    "cpv_codes",
  ],
  filterableAttributes: [
    "country",
    "region",
    "sector_primary",
    "sectors_secondary",
    "status",
    "source_slug",
    "language_original",
    "notice_type",
    "procurement_method",
    "published_at",
    "closing_at",
    "value_usd_est",
    "has_documents",
  ],
  sortableAttributes: ["closing_at", "published_at", "value_usd_est", "quality_score"],
  rankingRules: [
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
    "quality_score:desc",
    "published_at:desc",
  ],
  faceting: { maxValuesPerFacet: 100 },
  typoTolerance: {
    minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
  },
  pagination: { maxTotalHits: 2000 },
  synonyms: {
    rfp: ["request for proposals"],
    "request for proposals": ["rfp"],
    eoi: ["expression of interest"],
    "expression of interest": ["eoi"],
    rfq: ["request for quotations"],
    "request for quotations": ["rfq"],
    icb: ["international competitive bidding"],
    "international competitive bidding": ["icb"],
  },
} as const;

/** Search filters shared by the /search URL state and saved_searches.query. */
export interface SearchFilters {
  q?: string;
  countries?: string[];
  sectors?: string[];
  status?: string[];
  sources?: string[];
  valueMin?: number;
  valueMax?: number;
  /** ISO date — tenders closing on/before this date. */
  closingBefore?: string;
  /** Restrict archive depth: published within the last N days. */
  publishedWithinDays?: number;
  /** Alert matching: only tenders published after this unix timestamp. */
  publishedAfterUnix?: number;
  language?: string;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function inClause(field: string, values: string[]): string {
  return `${field} IN [${values.map(quote).join(", ")}]`;
}

/**
 * Builds a Meilisearch filter expression from SearchFilters.
 * Returns undefined when no filters apply.
 */
export function buildMeiliFilter(
  filters: SearchFilters,
  now: Date = new Date()
): string | undefined {
  const parts: string[] = [];

  if (filters.countries?.length) parts.push(inClause("country", filters.countries));
  if (filters.sectors?.length) parts.push(inClause("sector_primary", filters.sectors));
  if (filters.status?.length) parts.push(inClause("status", filters.status));
  if (filters.sources?.length) parts.push(inClause("source_slug", filters.sources));
  if (filters.language) parts.push(`language_original = ${quote(filters.language)}`);
  if (filters.valueMin !== undefined) parts.push(`value_usd_est >= ${filters.valueMin}`);
  if (filters.valueMax !== undefined) parts.push(`value_usd_est <= ${filters.valueMax}`);
  if (filters.closingBefore) {
    const ts = Math.floor(new Date(filters.closingBefore).getTime() / 1000);
    if (!Number.isNaN(ts)) parts.push(`closing_at <= ${ts}`);
  }
  if (filters.publishedWithinDays !== undefined) {
    const cutoff = Math.floor(now.getTime() / 1000) - filters.publishedWithinDays * 86_400;
    parts.push(`published_at >= ${cutoff}`);
  }
  if (filters.publishedAfterUnix !== undefined) {
    parts.push(`published_at > ${filters.publishedAfterUnix}`);
  }

  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

/** Parses /search URL searchParams into SearchFilters. */
export function parseSearchParams(
  params: Record<string, string | string[] | undefined>
): SearchFilters {
  const list = (v: string | string[] | undefined): string[] | undefined => {
    if (!v) return undefined;
    const arr = (Array.isArray(v) ? v : v.split(",")).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  };
  const num = (v: string | string[] | undefined): number | undefined => {
    if (typeof v !== "string" || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  return {
    q: typeof params.q === "string" && params.q.trim() ? params.q.trim() : undefined,
    countries: list(params.country),
    sectors: list(params.sector),
    status: list(params.status),
    sources: list(params.source),
    valueMin: num(params.value_min),
    valueMax: num(params.value_max),
    closingBefore:
      typeof params.closing_before === "string" && params.closing_before
        ? params.closing_before
        : undefined,
  };
}
