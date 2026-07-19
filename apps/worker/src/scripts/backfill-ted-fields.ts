import { eq, sql } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { TENDERS_INDEX } from "@repo/config/search";
import { getMeili } from "../meili";
import { tenderToDoc } from "../lib/tender-doc";

/**
 * One-off: enrich existing ted-eu tenders with the newly-captured structured
 * fields (procedure-type → procurement_method, contract-nature → contract_type,
 * total-value → estimated_value/currency, lot breakdown → lots). Fetched from
 * TED by publication-number (the stored source_notice_id), so it works on old
 * records the date-windowed scraper no longer returns.
 *
 * Merge discipline: procurement_method/contract_type/lots fill ONLY when empty
 * (no-downgrade). total-value is a SOURCE-structured value → it wins over an
 * AI-extracted estimate and stamps provenance source_page.
 *
 * DRY by default; --apply writes + reindexes.
 */
const apply = process.argv.includes("--apply");
const API = "https://api.ted.europa.eu/v3/notices/search";
const FIELDS = [
  "publication-number",
  "procedure-type",
  "contract-nature-main-proc",
  "total-value",
  "total-value-cur",
  "estimated-value-lot",
  "estimated-value-cur-lot",
  "title-lot",
  "award-criterion-name-lot",
  "award-criterion-number-weight-lot",
  "contract-duration-period-lot",
];

const NUM = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
};
const FIRST = (v: unknown): string | undefined =>
  Array.isArray(v) ? (v[0] as string) : (v as string | undefined);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLots(n: any) {
  const titles = n["title-lot"] ? n["title-lot"].eng ?? Object.values(n["title-lot"])[0] ?? [] : [];
  const values = n["estimated-value-lot"] ?? [];
  const currs = n["estimated-value-cur-lot"] ?? [];
  const critNames = n["award-criterion-name-lot"]
    ? n["award-criterion-name-lot"].eng ?? Object.values(n["award-criterion-name-lot"])[0] ?? []
    : [];
  const critWeights = n["award-criterion-number-weight-lot"] ?? [];
  const durations = n["contract-duration-period-lot"] ?? [];
  const count = Math.max(titles.length, values.length, durations.length);
  if (count === 0) return null;
  const lots = [];
  for (let i = 0; i < count; i++) {
    lots.push({
      title: titles[i],
      estimated_value: NUM(values[i]),
      currency: currs[i],
      award_criteria:
        i === 0 && critNames.length
          ? critNames.map((name: string, j: number) => ({ name, weight: NUM(critWeights[j]) }))
          : undefined,
      duration: durations[i]?.value
        ? `${durations[i].value} ${durations[i].unit ?? ""}`.trim()
        : undefined,
    });
  }
  return lots;
}

async function main() {
  const rows = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(sources.slug, "ted-eu"));
  console.log(`\n${apply ? "" : "[DRY] "}TED field backfill — ${rows.length} tenders`);

  const byId = new Map(rows.map((r) => [r.t.sourceNoticeId, r]));
  const ids = [...byId.keys()];

  // Fetch from TED in batches of 25 (query length limit).
  const fetched = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `publication-number IN (${batch.join(" ")})`,
        fields: FIELDS,
        limit: 50,
        scope: "ALL",
      }),
    });
    if (!res.ok) {
      console.error(`  batch ${i} failed: ${res.status}`);
      continue;
    }
    const json = (await res.json()) as { notices?: Record<string, unknown>[] };
    for (const n of json.notices ?? []) fetched.set(n["publication-number"] as string, n);
  }
  console.log(`  fetched ${fetched.size}/${ids.length} from TED`);

  const counts = { method: 0, ctype: 0, value: 0, lots: 0 };
  const touched: typeof rows = [];
  const now = new Date();

  for (const [pubNum, n] of fetched) {
    const row = byId.get(pubNum);
    if (!row) continue;
    const t = row.t;
    const update: Record<string, unknown> = {};

    // Fill-only (no-downgrade) for method + contract type.
    if (!t.procurementMethod && n["procedure-type"]) {
      update.procurementMethod = n["procedure-type"];
      counts.method++;
    }
    if (!t.contractType && n["contract-nature-main-proc"]) {
      update.contractType = n["contract-nature-main-proc"];
      counts.ctype++;
    }
    // Source-structured value wins over AI estimate → set + provenance.
    const totalValue = NUM(n["total-value"]);
    if (totalValue !== undefined) {
      update.estimatedValueMax = String(totalValue);
      const cur = FIRST(n["total-value-cur"]);
      if (cur) update.currency = cur.slice(0, 3);
      update.fieldProvenance = {
        ...t.fieldProvenance,
        estimated_value: "source_page",
        ...(cur ? { currency: "source_page" } : {}),
      };
      counts.value++;
    }
    const lots = buildLots(n);
    if (lots && !t.lots) {
      update.lots = lots;
      counts.lots++;
    }

    if (Object.keys(update).length === 0) continue;
    update.updatedAt = now;
    if (apply) {
      await db.update(tenders).set(update).where(eq(tenders.id, t.id));
      Object.assign(t, update);
      touched.push(row);
    } else {
      touched.push(row);
    }
  }

  console.log(
    `  to fill — procurement_method: ${counts.method}, contract_type: ${counts.ctype}, estimated_value: ${counts.value}, lots: ${counts.lots}`
  );

  if (!apply) {
    console.log(`\n[DRY] Nothing written. Re-run with --apply.`);
    process.exit(0);
  }

  const docs = touched.filter((r) => r.t.isPublished).map((r) => tenderToDoc(r.t, r.source));
  if (docs.length) await getMeili().index(TENDERS_INDEX).addDocuments(docs, { primaryKey: "id" });
  console.log(`\nApplied to ${touched.length} tenders, ${docs.length} reindexed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
