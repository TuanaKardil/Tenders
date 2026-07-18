import { and, eq, isNull } from "drizzle-orm";
import { db, noticeTypeMappings } from "@repo/db";
import { NOTICE_TYPES, type NoticeType } from "@repo/config/constants";
import { normalizeNoticeType, normalizeNoticeTypeKey } from "@repo/config/notice-type";
import { learnNoticeType } from "./ai";

/**
 * Self-growing notice-type resolution (DB dictionary + AI learning).
 * Lookup order per raw phrase:
 *   1. active DB mapping for (source_slug, raw)      — learned/curated
 *   2. active DB mapping for (null, raw)             — general rule
 *   3. static in-code dictionary (fallback, keeps working without DB writes)
 *   4. pending_review exists → "unknown" (never re-ask the AI while pending)
 *   5. AI learning: confidence ≥ 0.8 → store active('ai') and use it;
 *      below → store pending_review and return "unknown".
 *
 * SAFETY CAP: more than MAX_AI_PHRASES distinct new phrases in one run almost
 * certainly means a parsing bug upstream — the resolver throws with the list
 * instead of burning AI calls on garbage.
 */
const MAX_AI_PHRASES = 50;
const AI_ACCEPT_CONFIDENCE = 0.8;

const VALID = new Set<string>(NOTICE_TYPES);

export interface ResolverOptions {
  /** true: never write mappings or call-and-store; report would-be AI phrases instead. */
  dry?: boolean;
}

export interface ResolverReport {
  dbHits: number;
  staticHits: number;
  aiLearnedActive: { raw: string; source: string; enum: string; confidence: number }[];
  aiPending: { raw: string; source: string; enum: string; confidence: number }[];
  pendingSkipped: number;
  /** DRY mode: phrases that WOULD go to the AI. */
  wouldLearn: { raw: string; source: string }[];
}

export function createNoticeTypeResolver(opts: ResolverOptions = {}) {
  const report: ResolverReport = {
    dbHits: 0,
    staticHits: 0,
    aiLearnedActive: [],
    aiPending: [],
    pendingSkipped: 0,
    wouldLearn: [],
  };

  // (source|raw) → {enum,status} cache, loaded once per run.
  let cache: Map<string, { enum: NoticeType; status: string }> | null = null;
  const key = (slug: string | null, raw: string) => `${slug ?? "*"}|${raw}`;

  async function load(): Promise<NonNullable<typeof cache>> {
    if (cache) return cache;
    const rows = await db.select().from(noticeTypeMappings);
    cache = new Map(
      rows.map((r) => [key(r.sourceSlug, r.rawText), { enum: r.mappedEnum, status: r.status }])
    );
    return cache;
  }

  // Distinct phrases sent to (or queued for) the AI this run.
  const aiSeen = new Set<string>();

  async function resolve(
    rawInput: string | null | undefined,
    sourceSlug: string,
    language?: string | null
  ): Promise<NoticeType> {
    if (!rawInput?.trim()) return "unknown";
    const raw = normalizeNoticeTypeKey(rawInput);
    const map = await load();

    // 1–2. DB: source-specific, then general rule.
    for (const k of [key(sourceSlug, raw), key(null, raw)]) {
      const hit = map.get(k);
      if (hit?.status === "active") {
        report.dbHits++;
        return hit.enum;
      }
    }

    // 3. Static in-code dictionary (also covers keyword fallback).
    const staticResult = normalizeNoticeType(rawInput, sourceSlug);
    if (staticResult !== "unknown") {
      report.staticHits++;
      return staticResult;
    }

    // 4. Already pending review → stay unknown, never re-ask.
    if (map.get(key(sourceSlug, raw))?.status === "pending_review") {
      report.pendingSkipped++;
      return "unknown";
    }

    // 5. AI learning.
    const seenKey = key(sourceSlug, raw);
    if (opts.dry) {
      if (!aiSeen.has(seenKey)) {
        aiSeen.add(seenKey);
        report.wouldLearn.push({ raw, source: sourceSlug });
        if (report.wouldLearn.length > MAX_AI_PHRASES) {
          throw new Error(
            `Over ${MAX_AI_PHRASES} distinct unknown phrases — likely a parsing bug. First ones: ` +
              report.wouldLearn.slice(0, 10).map((w) => `"${w.raw}"`).join(", ")
          );
        }
      }
      return "unknown";
    }

    if (!aiSeen.has(seenKey)) {
      aiSeen.add(seenKey);
      if (aiSeen.size > MAX_AI_PHRASES) {
        throw new Error(
          `Over ${MAX_AI_PHRASES} distinct unknown phrases in one run — likely a parsing bug upstream. Aborting AI learning.`
        );
      }
      let learned;
      try {
        learned = await learnNoticeType(raw, sourceSlug, language);
      } catch (err) {
        console.error(`  learn failed for "${raw}" (kept unknown): ${(err as Error).message.slice(0, 120)}`);
        return "unknown";
      }
      const mappedEnum = (VALID.has(learned.enum) ? learned.enum : "unknown") as NoticeType;
      const accepted = learned.confidence >= AI_ACCEPT_CONFIDENCE && mappedEnum !== "unknown";

      await db
        .insert(noticeTypeMappings)
        .values({
          sourceSlug,
          rawText: raw,
          mappedEnum,
          confidence: learned.confidence,
          origin: "ai",
          status: accepted ? "active" : "pending_review",
          reasoning: learned.reasoning,
        })
        .onConflictDoNothing();
      map.set(key(sourceSlug, raw), {
        enum: mappedEnum,
        status: accepted ? "active" : "pending_review",
      });

      const entry = { raw, source: sourceSlug, enum: mappedEnum, confidence: learned.confidence };
      if (accepted) {
        report.aiLearnedActive.push(entry);
        return mappedEnum;
      }
      report.aiPending.push(entry);
      return "unknown";
    }

    // Phrase already handled this run — use whatever landed in the cache.
    const now = map.get(seenKey);
    return now?.status === "active" ? now.enum : "unknown";
  }

  return { resolve, report };
}
