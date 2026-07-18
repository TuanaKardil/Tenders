import { sql } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import type { IngestNotice } from "@repo/config/ingest";
import { createNoticeTypeResolver } from "../lib/notice-type-resolver";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";
import {
  computeSourceHash,
  extractionConfidence,
  qualityScore,
  statusFromClosingAt,
  tenderSlug,
  toDate,
} from "../lib/normalize";
import { fetchTed } from "../scrapers/ted";
import { fetchUganda } from "../scrapers/uganda";
import { fetchUngm } from "../scrapers/ungm";
import { fetchKenya } from "../scrapers/kenya";
import { fetchEthiopia } from "../scrapers/ethiopia";
import { fetchGuinea } from "../scrapers/guinea";

/** The five real sources we start with. Only `ted-eu` is wired to a scraper yet. */
const REAL_SOURCES = [
  { slug: "ted-eu", name: "TED — EU Tenders Electronic Daily", url: "https://ted.europa.eu", country: null, active: true, license: "green" },
  { slug: "ug-egp", name: "Uganda eGP", url: "https://egpuganda.go.ug", country: "UG", active: true, license: "green" },
  { slug: "ungm", name: "UN Global Marketplace", url: "https://www.ungm.org", country: null, active: true, license: "green" },
  { slug: "ke-ppip", name: "Kenya PPIP (tenders.go.ke)", url: "https://tenders.go.ke", country: "KE", active: true, license: "green" },
  { slug: "et-egp", name: "Ethiopia eGP", url: "https://production.egp.gov.et", country: "ET", active: true, license: "green" },
  // Private notice gazette (commercial, HTML) — YELLOW: metadata only, no body text.
  { slug: "gn-jao", name: "Guinée — Journal des Appels d'Offres (jaoguinee.com)", url: "https://www.jaoguinee.com", country: "GN", active: true, license: "yellow" },
] as const;

const ADAPTERS: Record<string, () => Promise<IngestNotice[]>> = {
  "ted-eu": fetchTed,
  "ug-egp": fetchUganda,
  ungm: fetchUngm,
  "ke-ppip": fetchKenya,
  "et-egp": fetchEthiopia,
  "gn-jao": fetchGuinea,
};

async function wipeFakeData() {
  console.log("Wiping seed/fake tender data...");
  await db.execute(sql`
    TRUNCATE tenders, buyers, sources, raw_notices, ingestion_runs, documents,
      redirect_clicks, watchlist_items, saved_searches, alert_deliveries,
      featured_tenders, dedupe_clusters, takedown_log
    RESTART IDENTITY CASCADE
  `);
  const index = getMeili().index(TENDERS_INDEX);
  await index.deleteAllDocuments();
  console.log("  cleared Postgres tender tables + Meilisearch index");
}

async function registerSources() {
  console.log("Registering real sources...");
  for (const s of REAL_SOURCES) {
    await db
      .insert(sources)
      .values({
        slug: s.slug,
        name: s.name,
        url: s.url,
        country: s.country,
        scraperKey: s.slug,
        isActive: s.active,
        licenseClass: s.license,
      })
      .onConflictDoUpdate({
        target: sources.slug,
        set: { name: s.name, isActive: s.active, licenseClass: s.license },
      });
  }
  console.log(`  ${REAL_SOURCES.length} sources registered`);
}

// One resolver per process run — its mapping cache and AI-phrase cap span all sources.
const noticeTypeResolver = createNoticeTypeResolver();

async function backfillSource(slug: string) {
  const adapter = ADAPTERS[slug];
  if (!adapter) return;
  const [source] = await db.select().from(sources).where(sql`slug = ${slug}`).limit(1);
  if (!source) throw new Error(`source ${slug} not registered`);

  console.log(`Fetching from ${slug}...`);
  let notices: IngestNotice[];
  try {
    notices = await adapter();
  } catch (err) {
    // One unreachable portal must never sink the whole run (daily automation).
    console.error(`  ✗ ${slug} fetch failed, skipping: ${(err as Error).message.slice(0, 120)}`);
    return;
  }
  console.log(`  ${notices.length} open + recent notices`);

  const now = new Date();
  const inserted: (typeof tenders.$inferSelect)[] = [];

  for (const data of notices) {
    // Drop notices with no resolved country — we don't show country-less tenders.
    if (!data.country) continue;
    const closingAt = toDate(data.closing_at);
    const confidence = extractionConfidence(data);
    const [row] = await db
      .insert(tenders)
      .values({
        slug: tenderSlug(data.title),
        sourceId: source.id,
        sourceNoticeId: data.source_notice_id,
        sourceUrl: data.source_url,
        sourceHash: computeSourceHash(data),
        titleOriginal: data.title,
        titleEn: data.title,
        summaryEn: data.description ?? null,
        languageOriginal: data.language ?? "en",
        country: (data.country ?? "ZZ").toUpperCase(),
        buyerNameRaw: data.buyer_name ?? null,
        sectorPrimary: data.sector ?? null,
        cpvCodes: data.cpv_codes ?? [],
        noticeType: await noticeTypeResolver.resolve(data.notice_type, source.slug, data.language),
        noticeTypeRaw: data.notice_type ?? null,
        publishedAt: toDate(data.published_at),
        closingAt,
        status: statusFromClosingAt(closingAt, now),
        extractionConfidence: confidence,
        qualityScore: qualityScore(data),
        isPublished: confidence >= 0.7,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (row) inserted.push(row);
  }

  const docs = inserted
    .filter((t) => t.isPublished)
    .map((t) => tenderToDoc(t, source));
  if (docs.length > 0) {
    await getMeili().index(TENDERS_INDEX).addDocuments(docs, { primaryKey: "id" });
  }
  console.log(`  inserted ${inserted.length}, indexed ${docs.length}`);
}

async function main() {
  // --wipe: one-off full reset (drops ALL tender data + Meili index) — never
  // used by automation. Default is incremental: onConflictDoNothing means
  // existing tenders are untouched and only new notices insert.
  if (process.argv.includes("--wipe")) {
    await wipeFakeData();
  }
  await registerSources();
  for (const slug of Object.keys(ADAPTERS)) {
    await backfillSource(slug);
  }
  // Dictionary learning report (AI-learned phrases from this run).
  const r = noticeTypeResolver.report;
  if (r.aiLearnedActive.length || r.aiPending.length) {
    console.log(`\nNotice-type dictionary learned this run:`);
    for (const l of r.aiLearnedActive)
      console.log(`  ✓ active  [${l.source}] "${l.raw}" ⇒ ${l.enum} (conf ${l.confidence.toFixed(2)})`);
    for (const l of r.aiPending)
      console.log(`  ? pending [${l.source}] "${l.raw}" ⇒ ${l.enum}? (conf ${l.confidence.toFixed(2)}) → /admin/sozluk`);
  }

  const total = await db.$count(tenders);
  console.log(`Done. tenders table now: ${total}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
