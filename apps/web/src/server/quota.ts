import "server-only";
import { Redis } from "ioredis";
import {
  QUOTA_SPECS,
  quotaKey,
  quotaLimit,
  type QuotaKind,
} from "@repo/config/quota";
import type { Entitlements } from "@repo/config/entitlements";
import { entitlementsForUser } from "./plan";

declare global {
  var __quotaRedis: Redis | undefined;
}

function getRedis(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  // Fail FAST: quotas are non-critical and fail open (see consumeQuota). If Redis
  // is unreachable or over quota, a command must reject quickly, not hang the page.
  return (globalThis.__quotaRedis ??= new Redis(url, {
    maxRetriesPerRequest: 1,
    commandTimeout: 2000,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    lazyConnect: false,
  }));
}

export interface QuotaResult {
  /** false only when a finite limit has been exceeded. */
  allowed: boolean;
  /** null = unlimited (plan grants no cap on this kind). */
  limit: number | null;
  used: number;
  remaining: number | null;
}

const UNLIMITED: QuotaResult = { allowed: true, limit: null, used: 0, remaining: null };

/**
 * Increment and check a metered quota for a signed-in user.
 * - Unlimited plans short-circuit without touching Redis.
 * - Fails OPEN: if Redis is unavailable we never block the product.
 * Pass `ent` when the caller already resolved entitlements to avoid a re-query.
 */
export async function consumeQuota(
  userId: string,
  kind: QuotaKind,
  ent?: Entitlements
): Promise<QuotaResult> {
  const entitlements = ent ?? (await entitlementsForUser(userId));
  const limit = quotaLimit(kind, entitlements);
  if (limit === null) return UNLIMITED;

  try {
    const redis = getRedis();
    const now = new Date();
    const key = quotaKey(kind, userId, now);
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, QUOTA_SPECS[kind].ttlSeconds);
    return { allowed: used <= limit, limit, used, remaining: Math.max(0, limit - used) };
  } catch {
    return { allowed: true, limit, used: 0, remaining: limit };
  }
}
