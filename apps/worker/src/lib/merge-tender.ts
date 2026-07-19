import { SECTOR_SLUGS } from "@repo/config/constants";
import { statusFromClosingAt } from "./normalize";
import type { ExtractedFields } from "./ai";

/**
 * THE single merge rule for writing AI-extracted data into tenders
 * (PIPELINE stage 5 → tenders table). Fill priority per critical field:
 *   a) the source's structured value (API/HTML field) — already in the row;
 *   b) if empty: the AI extraction result (input = page text + ALL document
 *      texts combined);
 *   c) a filled value is NEVER downgraded to empty, and AI never overrides
 *      a source-provided value.
 * Provenance is recorded per critical field:
 *   "source_page" | "document" | "ai_page_text" | "manual".
 *
 * Scraper adapters must not re-implement any of this.
 */

export const CRITICAL_FIELDS = [
  "closing_at",
  "published_at",
  "estimated_value",
  "currency",
  "buyer",
  "eligibility",
  "notice_type",
] as const;
export type CriticalField = (typeof CRITICAL_FIELDS)[number];
export type Provenance = "source_page" | "document" | "ai_page_text" | "manual";

const VALID_SECTORS = new Set<string>(SECTOR_SLUGS);

/** The slice of an existing tender row the merge needs to see. */
export interface ExistingCritical {
  closingAt: Date | null;
  estimatedValueMax: string | null;
  currency: string | null;
  eligibilityNotesEn: string | null;
  fieldProvenance: Record<string, string>;
}

export interface MergeResult {
  /** Column values to write (only what actually changes). */
  update: Record<string, unknown>;
  /** New provenance map (existing entries preserved). */
  provenance: Record<string, string>;
}

/** Join every document's text into one AI input, bounded by charCap. */
export function joinDocTexts(texts: (string | null | undefined)[], charCap: number): string {
  return texts
    .map((t) => t ?? "")
    .filter((t) => t.trim().length > 0)
    .join("\n\n---\n\n")
    .slice(0, charCap);
}

/**
 * Merge AI extraction output into an existing tender row.
 * @param hasDocText whether document text was part of the AI's input —
 *        decides "document" vs "ai_page_text" provenance.
 */
export function mergeExtractedFields(
  existing: ExistingCritical,
  ai: ExtractedFields,
  hasDocText: boolean,
  now: Date
): MergeResult {
  const update: Record<string, unknown> = {};
  const provenance: Record<string, string> = { ...existing.fieldProvenance };
  const aiOrigin: Provenance = hasDocText ? "document" : "ai_page_text";

  // --- estimated_value (min/max move together) ---
  if (ai.estimated_value_max !== null && existing.estimatedValueMax === null) {
    if (ai.estimated_value_min !== null) update.estimatedValueMin = String(ai.estimated_value_min);
    update.estimatedValueMax = String(ai.estimated_value_max);
    provenance.estimated_value = aiOrigin;
  }

  // --- currency ---
  if (ai.currency && existing.currency === null) {
    update.currency = ai.currency.slice(0, 3);
    provenance.currency = aiOrigin;
  }

  // --- eligibility ---
  if (ai.eligibility_notes_en && existing.eligibilityNotesEn === null) {
    update.eligibilityNotesEn = ai.eligibility_notes_en;
    provenance.eligibility = aiOrigin;
  }

  // --- closing_at (source deadlines are authoritative; sanity-check year) ---
  if (ai.closing_date && existing.closingAt === null) {
    const d = new Date(`${ai.closing_date}T00:00:00Z`);
    const year = d.getUTCFullYear();
    if (!Number.isNaN(d.getTime()) && year >= 2024 && year <= 2100) {
      update.closingAt = d;
      update.status = statusFromClosingAt(d, now);
      provenance.closing_at = aiOrigin;
    }
  }

  // --- non-critical enrichments (same coalesce spirit, no provenance keys) ---
  if (ai.sector_primary && ai.sector_primary !== "unknown" && VALID_SECTORS.has(ai.sector_primary)) {
    update.sectorPrimary = ai.sector_primary;
  }
  const secondary = ai.sectors_secondary.filter(
    (s) => VALID_SECTORS.has(s) && s !== ai.sector_primary
  );
  if (secondary.length) update.sectorsSecondary = secondary;
  if (ai.cpv_codes.length) update.cpvCodes = ai.cpv_codes;
  const elig = ai.eligibility_countries.filter((c) => /^[A-Z]{2}$/.test(c));
  if (elig.length) update.eligibilityCountries = elig;

  // notice_type_ai is a comparison signal, not the canonical enum — always record.
  if (ai.notice_type_ai) update.noticeTypeAi = ai.notice_type_ai;
  if (ai.extraction_confidence !== null) update.extractionConfidence = ai.extraction_confidence;

  update.fieldProvenance = provenance;
  return { update, provenance };
}

/**
 * Tenders whose documents were extracted AFTER the last merge — the
 * self-healing hook: late-arriving attachments put a tender back into the
 * daily extract-fields + translate-summarize pools automatically.
 * (Import kept here so the "stale" definition lives with the merge rule.)
 */
export const STALE_DOCS_SQL = `
  select distinct d.tender_id from documents d
  join tenders t on t.id = d.tender_id
  where d.extracted_at is not null
    and d.extracted_at > coalesce(t.docs_merged_at, 'epoch'::timestamptz)`;

/**
 * Provenance stamp for SCRAPE-TIME inserts: every critical field the source
 * itself provided is "source_page". Used by the insert paths.
 */
export function sourceProvenance(data: {
  closing_at?: string | null;
  published_at?: string | null;
  estimated_value_max?: number | null;
  currency?: string | null;
  buyer_name?: string | null;
  eligibility_notes?: string | null;
  notice_type?: string | null;
}): Record<string, string> {
  const p: Record<string, string> = {};
  if (data.closing_at) p.closing_at = "source_page";
  if (data.published_at) p.published_at = "source_page";
  if (data.estimated_value_max != null) p.estimated_value = "source_page";
  if (data.currency) p.currency = "source_page";
  if (data.buyer_name) p.buyer = "source_page";
  if (data.eligibility_notes) p.eligibility = "source_page";
  if (data.notice_type) p.notice_type = "source_page";
  return p;
}
