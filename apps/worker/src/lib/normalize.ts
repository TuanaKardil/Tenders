import { createHash } from "node:crypto";
import type { IngestNotice } from "@repo/config/ingest";
import { CLOSING_SOON_DAYS, type TenderStatus } from "@repo/config/constants";

/** Stable content hash over the fields that constitute a meaningful change. */
export function computeSourceHash(notice: IngestNotice): string {
  const relevant = [
    notice.title,
    notice.description ?? "",
    notice.closing_at ?? "",
    notice.published_at ?? "",
    notice.estimated_value_min ?? "",
    notice.estimated_value_max ?? "",
    notice.currency ?? "",
    notice.buyer_name ?? "",
    (notice.documents ?? []).map((d) => d.url).join(","),
  ].join("|");
  return createHash("sha256").update(relevant).digest("hex");
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Slug = title slug + short random suffix to avoid collisions. */
export function tenderSlug(title: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const base = slugify(title) || "tender";
  return `${base}-${suffix}`;
}

export function statusFromClosingAt(closingAt: Date | null, now = new Date()): TenderStatus {
  if (!closingAt) return "open";
  if (closingAt.getTime() <= now.getTime()) return "closed";
  const soonThreshold = new Date(now.getTime() + CLOSING_SOON_DAYS * 24 * 60 * 60 * 1000);
  if (closingAt.getTime() <= soonThreshold.getTime()) return "closing_soon";
  return "open";
}

/**
 * Confidence in the structured fields as delivered by the scraper.
 * Below 0.7 the tender lands in the admin review queue instead of auto-publish.
 */
export function extractionConfidence(notice: IngestNotice): number {
  let score = 0.4; // has the required identity fields
  if (notice.closing_at) score += 0.2;
  if (notice.country) score += 0.15;
  if (notice.buyer_name) score += 0.1;
  if (notice.sector) score += 0.05;
  if (notice.description || notice.raw_text) score += 0.1;
  return Math.min(score, 1);
}

/** Simple completeness-based quality score for ranking. */
export function qualityScore(notice: IngestNotice): number {
  const fields = [
    notice.closing_at,
    notice.published_at,
    notice.country,
    notice.buyer_name,
    notice.sector,
    notice.description,
    notice.estimated_value_max ?? notice.estimated_value_min,
    notice.documents?.length,
  ];
  const present = fields.filter(Boolean).length;
  return Math.round((present / fields.length) * 100) / 100;
}

export function toDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Update merge policy: a re-scrape must never degrade an existing tender.
 * Drops null values and empty arrays from the update so existing data wins,
 * while pass-through fields (hash, timestamps, status, …) always apply.
 */
export function coalesceUpdate<T extends Record<string, unknown>>(
  values: T,
  alwaysApply: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(values) as [keyof T, T[keyof T]][]) {
    const isEmpty =
      value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    if (!isEmpty || alwaysApply.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}
