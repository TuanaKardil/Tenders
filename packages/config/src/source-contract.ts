import type { IngestNotice } from "./ingest";
import type { LicenseClass } from "./constants";

/**
 * SOURCE CONTRACT — the minimum every scraper must satisfy. Sources differ
 * (JSON APIs, HTML scraping, WordPress...), so there is no universal scraper;
 * there IS a universal output shape and a set of rules. New sources implement
 * this; existing ones migrate opportunistically (see docs/SOURCE_CONTRACT.md).
 *
 * REQUIRED fields (a scraper must always fill; consciously-empty is a bug):
 *   source_notice_id · source_url · title (original) · country (ISO2) ·
 *   language · published_at (fall back to first-seen when the portal omits it)
 *
 * EXPECTED fields (take when the source offers them, null otherwise):
 *   buyer_name · closing_at · notice_type (raw) · documents[]
 *
 * Field precedence rule: absent from BOTH list and detail page → null.
 * Present on both → the DETAIL page wins (more likely complete).
 *
 * License red line: the notice BODY is never stored in full — description is
 * capped at DESCRIPTION_SNIPPET_MAX chars. Document files are linked, their
 * text extracted in stage 4, the file discarded. Linking a PDF is fine on any
 * license class; storing body text is not (yellow/commercial sources).
 */

/** Max stored characters of a notice body (metadata snippet, never full text). */
export const DESCRIPTION_SNIPPET_MAX = 300;

/** Minimum delay between requests to the same domain (politeness). */
export const SAME_DOMAIN_DELAY_MS = 500;

/** What a detail-page fetch extracts. All optional — null when absent. */
export interface DetailPageData {
  closing_at?: string; // ISO
  buyer_name?: string;
  notice_type_raw?: string;
  /** ≤ DESCRIPTION_SNIPPET_MAX chars, metadata only. */
  description_snippet?: string;
  /** Absolute URLs only. */
  documents: { title?: string; url: string; file_type?: string }[];
}

/** Every scraper that fetches detail pages exposes this. */
export type FetchDetail = (url: string) => Promise<DetailPageData>;

/** Per-scraper declaration of how the source is consumed. */
export interface SourceConfig {
  sourceSlug: string;
  /** e.g. "json-api", "html-list", "wordpress-category" */
  listPageStrategy: string;
  /** e.g. "none", "html", "json-api" */
  detailPageStrategy: string;
  licenseClass: LicenseClass;
  /** true → the scraper MUST fetch the detail page for every notice. */
  requiresDetailFetch: boolean;
}

/** Convenience: what adapters return (the ingest notice shape). */
export type ContractNotice = IngestNotice;
