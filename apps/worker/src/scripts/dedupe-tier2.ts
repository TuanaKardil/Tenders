import { eq, inArray, sql } from "drizzle-orm";
import { db, tenders, sources, tenderEmbeddings, dedupeClusters, dedupeCandidates } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { embedTexts, cosine, EMBEDDING_MODEL } from "../lib/embeddings";
import { judgeDuplicate } from "../lib/ai";

/**
 * Cross-source dedup — Tier 2, semantic (PIPELINE.md stage 7).
 *
 * 1. Embed title_en + summary_en per tender (text-embedding-004 → pgvector).
 * 2. Candidate pairs: DIFFERENT sources, SAME country (hard guard), closing
 *    within ±7 days, cosine similarity ≥ 0.85.
 * 3. LLM judge (Flash-Lite) on each candidate: same tender, yes/no + reason.
 * 4. yes + sim ≥ 0.90 → auto-merge into a cluster (method 'fuzzy').
 *    yes + sim < 0.90 → dedupe_candidates status 'review' (NO auto-merge).
 *    no → status 'rejected' (kept so re-runs skip the pair).
 *
 * Reversible: merging only sets dedupe_cluster_id; nothing is deleted.
 * DRY by default: embedding cost estimate, candidate count, judge cost
 * estimate — stops for approval if the total exceeds $5.
 */
const apply = process.argv.includes("--apply");
// --max-cost <usd>: hard budget for unattended runs — judge cost above it FAILS
// the script (exit 1) instead of waiting for human approval.
const maxCostIdx = process.argv.indexOf("--max-cost");
const maxCost = maxCostIdx > -1 ? Number(process.argv[maxCostIdx + 1]) || null : null;

const SIM_CANDIDATE = 0.85; // judge pairs at/above this
const SIM_AUTO = 0.9; // auto-merge only at/above this (judge-yes below → review)
const CLOSING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // ±7 days
const COST_STOP = 5; // USD
// Flash-Lite judge call: ~600 tokens in / ~50 out.
const JUDGE_COST_PER_PAIR = (600 * 0.1 + 50 * 0.4) / 1_000_000;

type Row = {
  id: string;
  title: string;
  summary: string | null;
  buyer: string | null;
  country: string;
  closingAt: Date | null;
  sourceId: string;
  sourceSlug: string;
  firstSeenAt: Date;
  dedupeClusterId: string | null;
};

function embedInput(t: Row): string {
  return [t.title, t.summary ?? ""].join("\n").trim();
}

async function main() {
  const rows: Row[] = (
    await db
      .select({
        id: tenders.id,
        title: sql<string>`coalesce(${tenders.titleEn}, ${tenders.titleOriginal})`,
        summary: tenders.summaryEn,
        buyer: tenders.buyerNameRaw,
        country: tenders.country,
        closingAt: tenders.closingAt,
        sourceId: tenders.sourceId,
        sourceSlug: sources.slug,
        firstSeenAt: tenders.firstSeenAt,
        dedupeClusterId: tenders.dedupeClusterId,
      })
      .from(tenders)
      .innerJoin(sources, eq(tenders.sourceId, sources.id))
  );

  // ---- 1. Embeddings (only missing ones) ----
  const have = new Set(
    (await db.select({ id: tenderEmbeddings.tenderId }).from(tenderEmbeddings)).map((r) => r.id)
  );
  const need = rows.filter((r) => !have.has(r.id));
  // text-embedding-004 is free-tier on AI Studio; report it anyway.
  console.log(`\n${apply ? "" : "[DRY] "}Dedup Tier 2 over ${rows.length} tenders`);
  console.log(`  embeddings: ${have.size} stored, ${need.length} to generate (${EMBEDDING_MODEL}, AI Studio free tier → $0.00)`);

  if (apply && need.length > 0) {
    const vectors = await embedTexts(need.map(embedInput));
    for (let i = 0; i < need.length; i++) {
      await db
        .insert(tenderEmbeddings)
        .values({ tenderId: need[i]!.id, embedding: vectors[i]! })
        .onConflictDoNothing();
    }
    console.log(`  → ${need.length} embeddings stored`);
  }

  // For DRY candidate counting we still need vectors — generate in memory
  // without storing (free + idempotent) so the report is real.
  const vecById = new Map<string, number[]>();
  if (!apply) {
    const all = rows;
    const vectors = await embedTexts(all.map(embedInput));
    all.forEach((r, i) => vecById.set(r.id, vectors[i]!));
  } else {
    const stored = await db.select().from(tenderEmbeddings);
    for (const s of stored) vecById.set(s.tenderId, s.embedding);
  }

  // ---- 2. Candidate pairs ----
  // Already-judged pairs are skipped (dedupe_candidates is the memory).
  const judged = new Set(
    (await db.select({ a: dedupeCandidates.tenderAId, b: dedupeCandidates.tenderBId }).from(dedupeCandidates)).map(
      (r) => `${r.a}|${r.b}`
    )
  );
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const byCountry = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byCountry.get(r.country) ?? [];
    list.push(r);
    byCountry.set(r.country, list);
  }

  const candidates: { a: Row; b: Row; sim: number }[] = [];
  for (const list of byCountry.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.sourceId === b.sourceId) continue; // cross-source only
        if (a.dedupeClusterId && a.dedupeClusterId === b.dedupeClusterId) continue; // already linked
        if (judged.has(pairKey(a.id, b.id))) continue; // already judged
        if (a.closingAt && b.closingAt && Math.abs(a.closingAt.getTime() - b.closingAt.getTime()) > CLOSING_WINDOW_MS)
          continue;
        const va = vecById.get(a.id);
        const vb = vecById.get(b.id);
        if (!va || !vb) continue;
        const sim = cosine(va, vb);
        if (sim >= SIM_CANDIDATE) candidates.push({ a, b, sim });
      }
    }
  }
  candidates.sort((x, y) => y.sim - x.sim);

  const judgeCost = candidates.length * JUDGE_COST_PER_PAIR;
  console.log(`  candidate pairs (cross-source, same country, ±7d, sim ≥ ${SIM_CANDIDATE}): ${candidates.length}`);
  console.log(`  judge cost estimate: $${judgeCost.toFixed(3)} (${candidates.length} × Flash-Lite)`);
  for (const c of candidates.slice(0, 10)) {
    console.log(
      `    sim ${c.sim.toFixed(3)} [${c.a.sourceSlug}↔${c.b.sourceSlug}|${c.a.country}]\n` +
        `      A: ${c.a.title.slice(0, 70)}\n      B: ${c.b.title.slice(0, 70)}`
    );
  }

  if (maxCost !== null && judgeCost > maxCost) {
    console.error(`✗ Judge cost $${judgeCost.toFixed(2)} exceeds --max-cost $${maxCost}. Aborting.`);
    process.exit(1);
  }
  if (maxCost === null && judgeCost > COST_STOP) {
    console.log(`\n⚠ Estimate exceeds $${COST_STOP} — STOP. Confirm before --apply.`);
    process.exit(0);
  }
  if (!apply) {
    console.log(`\n[DRY] Nothing written (embeddings not stored, no judging). Re-run with --apply after approval.`);
    process.exit(0);
  }

  // ---- 3. Judge + 4. merge / review / reject ----
  let merged = 0;
  let review = 0;
  let rejected = 0;
  const hiddenIds: string[] = [];

  for (const { a, b, sim } of candidates) {
    let verdict;
    try {
      verdict = await judgeDuplicate(
        { title: a.title, buyer: a.buyer, country: a.country, closing: a.closingAt?.toISOString().slice(0, 10), source: a.sourceSlug, summary: a.summary },
        { title: b.title, buyer: b.buyer, country: b.country, closing: b.closingAt?.toISOString().slice(0, 10), source: b.sourceSlug, summary: b.summary }
      );
    } catch (err) {
      console.log(`  ✗ judge failed (pair skipped): ${(err as Error).message.slice(0, 100)}`);
      continue;
    }

    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    let status: string;
    if (!verdict.same_tender) {
      status = "rejected";
      rejected++;
    } else if (sim >= SIM_AUTO) {
      status = "merged";
      merged++;
    } else {
      status = "review"; // judge says yes but sim < 0.90 → human decides
      review++;
    }

    await db
      .insert(dedupeCandidates)
      .values({ tenderAId: first.id, tenderBId: second.id, similarity: sim, verdict: verdict.same_tender ? "yes" : "no", reason: verdict.reason, status })
      .onConflictDoNothing();

    if (status === "merged") {
      // Primary = earliest first_seen; reuse an existing cluster if one side has one.
      const primary = a.firstSeenAt <= b.firstSeenAt ? a : b;
      const other = primary === a ? b : a;
      let clusterId = a.dedupeClusterId ?? b.dedupeClusterId;
      if (!clusterId) {
        const [c] = await db
          .insert(dedupeClusters)
          .values({ canonicalTenderId: primary.id, method: "fuzzy", confidence: sim, memberCount: 2 })
          .returning({ id: dedupeClusters.id });
        clusterId = c!.id;
      } else {
        await db
          .update(dedupeClusters)
          .set({ memberCount: sql`${dedupeClusters.memberCount} + 1` })
          .where(eq(dedupeClusters.id, clusterId));
      }
      await db.update(tenders).set({ dedupeClusterId: clusterId }).where(inArray(tenders.id, [a.id, b.id]));
      a.dedupeClusterId = clusterId;
      b.dedupeClusterId = clusterId;
      hiddenIds.push(other.id);
      console.log(`  ✓ MERGED  sim ${sim.toFixed(3)} — ${verdict.reason.slice(0, 80)}`);
    } else if (status === "review") {
      console.log(`  ? REVIEW  sim ${sim.toFixed(3)} — ${verdict.reason.slice(0, 80)}`);
    } else {
      console.log(`  · no      sim ${sim.toFixed(3)} — ${verdict.reason.slice(0, 80)}`);
    }
  }

  if (hiddenIds.length > 0) {
    await getMeili().index(TENDERS_INDEX).deleteDocuments(hiddenIds);
  }
  console.log(
    `\nApplied: ${merged} merged (auto), ${review} → review queue, ${rejected} rejected; ${hiddenIds.length} non-primary removed from Meilisearch.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
