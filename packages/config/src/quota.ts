import type { Entitlements } from "./entitlements";

/**
 * Metered quota kinds. Counters live in Redis, keyed per user and period; the
 * ceilings come from the plan's Entitlements. `null` limit = unlimited.
 */
export type QuotaKind = "search" | "detail" | "click";

interface QuotaSpec {
  /** Entitlements field holding the ceiling for this kind. */
  limitField: "searchesPerDay" | "detailViewsPerMonth" | "sourceClicksPerMonth";
  period: "day" | "month";
  /** Counter TTL (seconds) — a bit longer than the period, so stale keys self-clean. */
  ttlSeconds: number;
}

export const QUOTA_SPECS: Record<QuotaKind, QuotaSpec> = {
  search: { limitField: "searchesPerDay", period: "day", ttlSeconds: 2 * 86_400 },
  detail: { limitField: "detailViewsPerMonth", period: "month", ttlSeconds: 40 * 86_400 },
  click: { limitField: "sourceClicksPerMonth", period: "month", ttlSeconds: 40 * 86_400 },
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** UTC period stamp: `YYYY-MM-DD` for daily, `YYYY-MM` for monthly. */
export function periodStamp(period: "day" | "month", now: Date): string {
  const ym = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  return period === "month" ? ym : `${ym}-${pad(now.getUTCDate())}`;
}

/** Redis key for a user's quota counter in the current period. */
export function quotaKey(kind: QuotaKind, userId: string, now: Date): string {
  return `q:${kind}:${userId}:${periodStamp(QUOTA_SPECS[kind].period, now)}`;
}

/** The plan ceiling for a quota kind (`null` = unlimited). */
export function quotaLimit(kind: QuotaKind, ent: Entitlements): number | null {
  return ent[QUOTA_SPECS[kind].limitField];
}
