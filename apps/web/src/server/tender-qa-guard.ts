import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, aiUsageEvents, aiAnswerCache } from "@repo/db";
import type { Entitlements } from "@repo/config/entitlements";
import { tenderQaModel } from "@repo/ai/tender-qa";

/**
 * Quotas, rate limits, cache and the usage ledger for the tender QA
 * assistant. Everything is Postgres COUNT/SUM over ai_usage_events —
 * deliberately NO Redis. Minute precision is "the last 60 seconds", which is
 * all abuse control needs.
 */

// Rate limits (spec).
const PER_USER_PER_MINUTE = 5;
const PER_IP_PER_MINUTE = 20;
const CACHE_TTL_DAYS = 30;

/** Daily platform-wide spend ceiling — the bill insurance. */
function dailyBudgetUsd(): number {
  const v = Number(process.env.AI_CHAT_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

export type GuardRejection =
  | { reason: "rate_limited" } // try again shortly
  | { reason: "quota_monthly"; limit: number } // upgrade card
  | { reason: "quota_tender_daily"; limit: number } // upgrade card
  | { reason: "budget_exhausted" }; // platform-wide, polite unavailable

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

export function questionHash(q: string): string {
  return createHash("sha256").update(`${tenderQaModel()}|${normalizeQuestion(q)}`).digest("hex");
}

/** knowledge_version: updated_at epoch + document count — either change busts the cache. */
export function knowledgeVersion(tenderUpdatedAt: Date, documentsCount: number): string {
  return `${tenderUpdatedAt.getTime()}:${documentsCount}`;
}

/** All pre-flight checks. Returns null when the request may proceed. */
export async function checkQaLimits(
  userId: string,
  tenderId: string,
  ip: string | null,
  ent: Entitlements
): Promise<GuardRejection | null> {
  const now = Date.now();
  const minuteAgo = new Date(now - 60_000);
  const dayStart = new Date(new Date().toISOString().slice(0, 10)); // UTC midnight
  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01");

  // Platform-wide daily budget (cheapest kill-switch first).
  const [budget] = await db
    .select({ cost: sql<number>`coalesce(sum(estimated_cost), 0)` })
    .from(aiUsageEvents)
    .where(gte(aiUsageEvents.createdAt, dayStart));
  if ((budget?.cost ?? 0) >= dailyBudgetUsd()) return { reason: "budget_exhausted" };

  // Per-user + per-IP minute rate limits.
  const [perUser] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.userId, userId), gte(aiUsageEvents.createdAt, minuteAgo)));
  if ((perUser?.n ?? 0) >= PER_USER_PER_MINUTE) return { reason: "rate_limited" };

  if (ip) {
    const [perIp] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.ip, ip), gte(aiUsageEvents.createdAt, minuteAgo)));
    if ((perIp?.n ?? 0) >= PER_IP_PER_MINUTE) return { reason: "rate_limited" };
  }

  // Plan quotas (ent comes from entitlements — the single source of gating truth).
  const [monthly] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.userId, userId),
        gte(aiUsageEvents.createdAt, monthStart),
        sql`status != 'error'` // failed calls don't consume quota
      )
    );
  if ((monthly?.n ?? 0) >= ent.aiQuestionsPerMonth) {
    return { reason: "quota_monthly", limit: ent.aiQuestionsPerMonth };
  }

  const [tenderDaily] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.userId, userId),
        eq(aiUsageEvents.tenderId, tenderId),
        gte(aiUsageEvents.createdAt, dayStart),
        sql`status != 'error'`
      )
    );
  if ((tenderDaily?.n ?? 0) >= ent.aiQuestionsPerTenderPerDay) {
    return { reason: "quota_tender_daily", limit: ent.aiQuestionsPerTenderPerDay };
  }

  return null;
}

export interface CachedAnswer {
  status: string;
  language: string;
  answer: string;
  citations: unknown[];
}

export async function cacheLookup(
  tenderId: string,
  qHash: string,
  version: string
): Promise<CachedAnswer | null> {
  const ttlFloor = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000);
  const [hit] = await db
    .select()
    .from(aiAnswerCache)
    .where(
      and(
        eq(aiAnswerCache.tenderId, tenderId),
        eq(aiAnswerCache.questionHash, qHash),
        eq(aiAnswerCache.knowledgeVersion, version),
        gte(aiAnswerCache.createdAt, ttlFloor)
      )
    )
    .limit(1);
  return hit?.answerJson ?? null;
}

export async function cacheStore(
  tenderId: string,
  qHash: string,
  version: string,
  answer: CachedAnswer
): Promise<void> {
  await db
    .insert(aiAnswerCache)
    .values({ tenderId, questionHash: qHash, knowledgeVersion: version, answerJson: answer })
    .onConflictDoNothing();
}

export async function logUsage(row: {
  userId: string;
  tenderId: string;
  questionHash: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  status: "answered" | "not_found" | "out_of_scope" | "cached" | "error";
  ip: string | null;
}): Promise<void> {
  await db.insert(aiUsageEvents).values({
    userId: row.userId,
    tenderId: row.tenderId,
    questionHash: row.questionHash,
    model: row.model,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    estimatedCost: row.estimatedCost ?? 0,
    status: row.status,
    ip: row.ip,
  });
}
