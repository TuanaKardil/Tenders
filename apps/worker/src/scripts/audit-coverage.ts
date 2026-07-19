import * as cheerio from "cheerio";
import { and, eq, sql } from "drizzle-orm";
import { db, tenders, sources, documents, documentCoverageAudits } from "@repo/db";
import { DETAIL_FETCH_SOURCES } from "@repo/config/source-contract";
import { politeFetchHtml } from "../scrapers/shared";

/**
 * Spot-check document-coverage audit (6c). Once per run, for each detail-fetch
 * source, pick ONE random tender, re-fetch its detail page and count document
 * links INDEPENDENTLY of the scraper (its own cheerio pass, not fetchDetail) —
 * so a broken selector surfaces as expected > actual with the missed URLs
 * recorded. ≤ 1 request per source (6 total), 500ms same-domain spacing via
 * politeFetchHtml.
 *
 * DRY by default (prints, writes nothing); --apply records audit rows.
 */
const apply = process.argv.includes("--apply");
const DOC_EXT_RE = /\.(pdf|docx?|xlsx?|zip)(?:\?|#|$)/i;

/** Every same-domain document link on the page (independent of the scraper). */
function countDocLinks(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !DOC_EXT_RE.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    // Same-domain only (ignore external CDNs/off-site links).
    if (abs.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return;
    seen.add(abs.toString());
  });
  return [...seen];
}

async function main() {
  const runIdArg = process.argv.indexOf("--run");
  const runId = runIdArg > -1 ? process.argv[runIdArg + 1] : undefined;

  console.log(`\n${apply ? "" : "[DRY] "}Coverage spot-check — ${DETAIL_FETCH_SOURCES.length} detail-fetch source(s)`);

  for (const slug of DETAIL_FETCH_SOURCES) {
    // Prefer a tender first seen in the last 2 days (this run); else any.
    const pick = async (recentOnly: boolean) =>
      db
        .select({ id: tenders.id, url: tenders.sourceUrl, title: tenders.titleOriginal, docs: tenders.documentsCount })
        .from(tenders)
        .innerJoin(sources, eq(tenders.sourceId, sources.id))
        .where(
          recentOnly
            ? and(eq(sources.slug, slug), sql`${tenders.firstSeenAt} >= now() - interval '2 days'`)
            : eq(sources.slug, slug)
        )
        .orderBy(sql`random()`)
        .limit(1);
    const [t] = (await pick(true)).length ? await pick(true) : await pick(false);
    if (!t) {
      console.log(`  ${slug}: no tender to sample`);
      continue;
    }

    let expected: string[];
    try {
      const html = await politeFetchHtml(t.url);
      expected = countDocLinks(html, t.url);
    } catch (err) {
      console.log(`  ${slug}: detail fetch failed (${(err as Error).message.slice(0, 60)}) — skipped`);
      continue;
    }

    const dbDocs = await db
      .select({ url: documents.url })
      .from(documents)
      .where(eq(documents.tenderId, t.id));
    const dbUrls = new Set(dbDocs.map((d) => d.url));
    const missed = expected.filter((u) => !dbUrls.has(u));
    const mismatch = expected.length > t.docs;

    console.log(
      `  ${slug}: sayfada ${expected.length}, DB'de ${t.docs}${mismatch ? ` ⚠ ${missed.length} eksik` : " ✓"} — ${t.title.slice(0, 45)}`
    );

    if (apply) {
      await db.insert(documentCoverageAudits).values({
        tenderId: t.id,
        runId: runId ?? null,
        expectedCount: expected.length,
        actualCount: t.docs,
        missedUrls: missed,
      });
    }
  }

  if (!apply) console.log(`\n[DRY] Nothing written. Re-run with --apply.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
