export type Plan = "free" | "starter" | "pro";

export type AlertFrequency = "instant" | "daily" | "weekly";

/**
 * Single source of truth for plan gating. `null` = unlimited.
 * Quota counters live in Redis with period TTLs; these are the ceilings.
 */
export interface Entitlements {
  /** Searches per day (Meilisearch-backed queries). */
  searchesPerDay: number | null;
  /** Archive depth in days (how far back published_at may go). */
  archiveDays: number | null;
  /** Tender detail page views per month. */
  detailViewsPerMonth: number | null;
  /** Tracked /go original-source clicks per month. */
  sourceClicksPerMonth: number | null;
  /** Max saved-search alerts. */
  maxAlerts: number;
  /** Fastest alert frequency allowed. */
  allowedFrequencies: AlertFrequency[];
  /** Max watchlist items. */
  maxWatchlistItems: number | null;
  /** AI summaries: "sample" = curated sample tenders only, "all" = every tender. */
  aiSummaries: "sample" | "all";
  /** CSV export of search results. */
  csvExport: boolean;
  /** AI eligibility analysis block on detail pages. */
  eligibilityAi: boolean;
  /** Tender QA assistant: questions per calendar month. */
  aiQuestionsPerMonth: number;
  /** Tender QA assistant: questions per tender per day. */
  aiQuestionsPerTenderPerDay: number;
}

export const ENTITLEMENTS: Record<Plan, Entitlements> = {
  free: {
    searchesPerDay: 10,
    archiveDays: 30,
    detailViewsPerMonth: 20,
    sourceClicksPerMonth: 5,
    maxAlerts: 1,
    allowedFrequencies: ["weekly"],
    maxWatchlistItems: 10,
    aiSummaries: "sample",
    csvExport: false,
    eligibilityAi: false,
    aiQuestionsPerMonth: 10,
    aiQuestionsPerTenderPerDay: 3,
  },
  starter: {
    searchesPerDay: null,
    archiveDays: null,
    detailViewsPerMonth: null,
    sourceClicksPerMonth: null,
    maxAlerts: 10,
    allowedFrequencies: ["daily", "weekly"],
    maxWatchlistItems: null,
    aiSummaries: "all",
    csvExport: false,
    eligibilityAi: false,
    aiQuestionsPerMonth: 250,
    aiQuestionsPerTenderPerDay: 20,
  },
  pro: {
    searchesPerDay: null,
    archiveDays: null,
    detailViewsPerMonth: null,
    sourceClicksPerMonth: null,
    maxAlerts: 30,
    allowedFrequencies: ["instant", "daily", "weekly"],
    maxWatchlistItems: null,
    aiSummaries: "all",
    csvExport: true,
    eligibilityAi: true,
    aiQuestionsPerMonth: 2000,
    aiQuestionsPerTenderPerDay: 100,
  },
};

export function entitlementsFor(plan: Plan): Entitlements {
  return ENTITLEMENTS[plan];
}

/** Number of globally curated sample tenders with AI summaries on the Free plan. */
export const FREE_AI_SAMPLE_COUNT = 3;
