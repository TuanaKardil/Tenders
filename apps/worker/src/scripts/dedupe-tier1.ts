import { eq, inArray } from "drizzle-orm";
import { db, tenders, dedupeClusters, sources } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";

/**
 * Cross-source dedup — Tier 1, deterministic (PIPELINE.md stage 3). No AI.
 *
 * Same-source duplicates never reach here: the unique index on
 * (source_id, source_notice_id) plus the normalize worker's existing-row check
 * make a re-scrape an UPDATE, not a new tender.
 *
 * Cross-source signals (either one links two tenders into a cluster):
 *   A. same country + same normalized buyer + closing within ±2 days
 *      + same normalized title
 *   B. one tender's source_url appears inside the other's (UNGM often links
 *      the original portal) — still requires the same country (hard guard).
 *
 * HARD GUARD: tenders from different countries are NEVER clustered.
 *
 * Clustering is reversible: we only create dedupe_clusters rows and set
 * tenders.dedupe_cluster_id — nothing is deleted or unpublished. Resetting is
 * "set dedupe_cluster_id = null; delete from dedupe_clusters".
 *
 * Primary (canonical) pick: highest field-fill score, tie → earliest
 * first_seen_at. On --apply, non-primary members are removed from Meilisearch
 * so search shows one canonical result per cluster.
 *
 * DRY by default; --apply writes.
 */
const apply = process.argv.includes("--apply");

const CLOSING_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // ±2 days

/** Strip punctuation first, then boilerplate prefixes; collapse spaces, lowercase. */
export function normalizeTitle(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation → space FIRST, so "bid:" matches
    .replace(/\s+/g, " ")
    .trim();
  // Drop standard notice prefixes (repeat so stacked prefixes all go).
  const PREFIXES =
    /^(tender for|invitation to bid for|invitation to bid|invitation to tender for|invitation to tender|request for quotations? for|request for proposals? for|notice of|provision of|supply and delivery of|procurement of|expression of interest for|eoi for|rfp for|rfq for)\s+/;
  for (let i = 0; i < 3; i++) s = s.replace(PREFIXES, "");
  return s.trim();
}

/** Normalize a buyer name for comparison (case, punctuation, common suffixes). */
export function normalizeBuyer(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(ltd|limited|inc|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
}

/** Bare URL for containment checks: no protocol/www, no trailing slash. */
function bareUrl(url: string): string {
  return url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

type Row = typeof tenders.$inferSelect & { sourceSlug: string };

/** How much data a tender carries — the fullest member becomes the primary. */
function fillScore(t: Row): number {
  let s = 0;
  for (const v of [
    t.titleEn, t.titleTr, t.summaryEn, t.summaryTr, t.buyerNameRaw, t.funderName,
    t.sectorPrimary, t.city, t.currency, t.estimatedValueMax, t.eligibilityNotesEn,
    t.closingAt, t.publishedAt, t.noticeTypeAi,
  ]) {
    if (v !== null && v !== undefined && String(v).trim() !== "") s++;
  }
  s += Math.min(t.cpvCodes.length, 3);
  s += Math.min(t.eligibilityCountries.length, 2);
  if (t.documentsCount > 0) s += 2;
  return s;
}

// Minimal union-find.
class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x);
    if (!p || p === x) {
      this.parent.set(x, x);
      return x;
    }
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

async function main() {
  const rows: Row[] = (
    await db
      .select({ t: tenders, sourceSlug: sources.slug })
      .from(tenders)
      .innerJoin(sources, eq(tenders.sourceId, sources.id))
  ).map(({ t, sourceSlug }) => ({ ...t, sourceSlug }));

  const uf = new UnionFind();
  const pairReasons: { a: Row; b: Row; reason: string }[] = [];

  // Signal A: country + buyer + closing window + title, all normalized.
  // Bucket by country+buyer first so we only compare plausible pairs.
  const buckets = new Map<string, Row[]>();
  for (const t of rows) {
    const buyer = normalizeBuyer(t.buyerNameRaw);
    if (!buyer) continue;
    const key = `${t.country}|${buyer}`;
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.sourceId === b.sourceId) continue; // same source = upsert territory
        if (!a.closingAt || !b.closingAt) continue;
        if (Math.abs(a.closingAt.getTime() - b.closingAt.getTime()) > CLOSING_WINDOW_MS) continue;
        if (normalizeTitle(a.titleOriginal) !== normalizeTitle(b.titleOriginal)) continue;
        uf.union(a.id, b.id);
        pairReasons.push({ a, b, reason: "country+buyer+closing±2d+title" });
      }
    }
  }

  // Signal B: URL containment across sources (same country only — hard guard).
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.sourceId === b.sourceId) continue;
      if (a.country !== b.country) continue; // HARD GUARD
      const ua = bareUrl(a.sourceUrl);
      const ub = bareUrl(b.sourceUrl);
      if (ua.length < 15 || ub.length < 15) continue; // avoid trivial containment
      if (ua.includes(ub) || ub.includes(ua)) {
        uf.union(a.id, b.id);
        pairReasons.push({ a, b, reason: "url-containment" });
      }
    }
  }

  // Build clusters from union-find roots.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const clusters = new Map<string, Row[]>();
  for (const { a, b } of pairReasons) {
    for (const t of [a, b]) {
      const root = uf.find(t.id);
      const list = clusters.get(root) ?? [];
      if (!list.some((x) => x.id === t.id)) list.push(byId.get(t.id)!);
      clusters.set(root, list);
    }
  }

  const clusterList = [...clusters.values()].filter((c) => c.length > 1);
  const merged = clusterList.reduce((n, c) => n + c.length, 0);

  console.log(`\n${apply ? "" : "[DRY] "}Dedup Tier 1 over ${rows.length} tenders`);
  console.log(`  clusters found : ${clusterList.length}`);
  console.log(`  tenders linked : ${merged} (${merged - clusterList.length} would drop out of search)`);

  for (const c of clusterList) {
    const primary = [...c].sort(
      (x, y) => fillScore(y) - fillScore(x) || x.firstSeenAt.getTime() - y.firstSeenAt.getTime()
    )[0]!;
    console.log(`\n  cluster (${c.length}):`);
    for (const t of c) {
      const mark = t.id === primary.id ? "★ primary" : "  member ";
      console.log(`    ${mark} [${t.sourceSlug}|${t.country}] ${t.titleOriginal.slice(0, 70)}`);
    }
    const reason = pairReasons.find((p) => c.some((x) => x.id === p.a.id))?.reason;
    console.log(`    reason: ${reason}`);
  }

  if (!apply) {
    console.log(`\n[DRY] Nothing written. Re-run with --apply after approval.`);
    process.exit(0);
  }

  // --apply: create clusters, assign members, hide non-primaries from Meili.
  const nonPrimaryIds: string[] = [];
  for (const c of clusterList) {
    const sorted = [...c].sort(
      (x, y) => fillScore(y) - fillScore(x) || x.firstSeenAt.getTime() - y.firstSeenAt.getTime()
    );
    const primary = sorted[0]!;
    const [cluster] = await db
      .insert(dedupeClusters)
      .values({ canonicalTenderId: primary.id, method: "hash", confidence: 1, memberCount: c.length })
      .returning({ id: dedupeClusters.id });
    if (!cluster) throw new Error("cluster insert returned no row");
    await db
      .update(tenders)
      .set({ dedupeClusterId: cluster.id })
      .where(inArray(tenders.id, c.map((t) => t.id)));
    nonPrimaryIds.push(...sorted.slice(1).map((t) => t.id));
  }

  if (nonPrimaryIds.length > 0) {
    await getMeili().index(TENDERS_INDEX).deleteDocuments(nonPrimaryIds);
  }
  console.log(
    `\nApplied: ${clusterList.length} clusters, ${merged} tenders linked, ${nonPrimaryIds.length} non-primary removed from Meilisearch.`
  );
  console.log(`Reversible: set dedupe_cluster_id = null + delete dedupe_clusters rows, then reindex.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
