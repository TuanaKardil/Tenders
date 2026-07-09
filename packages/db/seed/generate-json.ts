/**
 * Emits seed buyers + tenders as JSON (snake_case keys) for loading via
 * PostgREST when no direct connection string is available.
 * Usage: tsx seed/generate-json.ts <out-dir> [sources.json]
 * sources.json: optional {slug: uuid} map of already-inserted source ids;
 * omit to generate fresh ids (written to <out-dir>/sources.json).
 */
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { faker } from "@faker-js/faker";
import {
  SEED_SOURCES,
  SEED_COUNTRIES,
  SECTOR_TEMPLATES,
  CITIES,
  BUYER_PATTERNS,
  SECTOR_WORDS,
} from "./data";

faker.seed(20260709);

const TENDER_COUNT = 200;
const outDir = process.argv[2] ?? ".";
const sourceMapPath = process.argv[3];

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fillTemplate(template: string, country: string): string {
  const cities = CITIES[country] ?? ["Central"];
  return template
    .replace("{place2}", faker.helpers.arrayElement(cities))
    .replace("{place}", faker.helpers.arrayElement(cities))
    .replace("{n}", String(faker.number.int({ min: 2, max: 120 })));
}

const sourceIds: Record<string, string> =
  sourceMapPath && existsSync(sourceMapPath)
    ? JSON.parse(readFileSync(sourceMapPath, "utf8"))
    : Object.fromEntries(SEED_SOURCES.map((s) => [s.slug, randomUUID()]));

const buyers: Record<string, unknown>[] = [];
const buyerRows: { id: string; name: string; country: string }[] = [];
const seenBuyerSlugs = new Set<string>();
const sectorSlugs = Object.keys(SECTOR_TEMPLATES);

for (const { code } of SEED_COUNTRIES) {
  for (let i = 0; i < 3; i++) {
    const sector = faker.helpers.arrayElement(sectorSlugs);
    const city = faker.helpers.arrayElement(CITIES[code] ?? ["Central"]);
    const name = faker.helpers
      .arrayElement(BUYER_PATTERNS)
      .replace("{sector_word}", SECTOR_WORDS[sector] ?? "Works")
      .replace("{city}", city);
    const slug = `${slugify(name)}-${code.toLowerCase()}`;
    if (seenBuyerSlugs.has(slug)) continue;
    seenBuyerSlugs.add(slug);
    const id = randomUUID();
    buyerRows.push({ id, name, country: code });
    buyers.push({
      id,
      slug,
      name,
      name_normalized: name.toLowerCase().replace(/[^a-z0-9 ]/g, ""),
      country: code,
      buyer_type: faker.helpers.arrayElement([
        "government",
        "government",
        "government",
        "soe",
        "ngo",
      ]),
    });
  }
}

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const tenders: Record<string, unknown>[] = [];

for (let i = 0; i < TENDER_COUNT; i++) {
  const countryInfo = faker.helpers.arrayElement(SEED_COUNTRIES);
  const sector = faker.helpers.arrayElement(sectorSlugs);
  const templates = SECTOR_TEMPLATES[sector] ?? [];
  const title = fillTemplate(faker.helpers.arrayElement(templates), countryInfo.code);

  const source = faker.helpers.weightedArrayElement(
    SEED_SOURCES.map((s) => ({
      value: s,
      weight: s.country === null ? 1 : s.country === countryInfo.code ? 12 : 0.2,
    }))
  );

  const buyerPool = buyerRows.filter((b) => b.country === countryInfo.code);
  const buyer = buyerPool.length > 0 ? faker.helpers.arrayElement(buyerPool) : null;

  const publishedAt = new Date(now - faker.number.int({ min: 0, max: 45 }) * DAY);
  const closingOffsetDays = faker.helpers.weightedArrayElement([
    { value: faker.number.int({ min: 8, max: 60 }), weight: 6 },
    { value: faker.number.int({ min: 1, max: 7 }), weight: 2 },
    { value: -faker.number.int({ min: 1, max: 20 }), weight: 2 },
  ]);
  const closingAt = new Date(now + closingOffsetDays * DAY);
  const status =
    closingOffsetDays < 0 ? "closed" : closingOffsetDays <= 7 ? "closing_soon" : "open";

  const valueLocal = faker.number.int({ min: 40, max: 5000 }) * 10_000;
  const valueUsd = Math.round(valueLocal * countryInfo.usdRate);
  const confidence = faker.number.float({ min: 0.5, max: 1, fractionDigits: 2 });
  const sourceNoticeId = `${source.slug.toUpperCase()}-2026-${1000 + i}`;
  const isFr = ["SN", "CI", "CM", "MA"].includes(countryInfo.code);

  tenders.push({
    slug: `${slugify(title)}-${faker.string.alphanumeric(6).toLowerCase()}`,
    source_id: sourceIds[source.slug],
    source_notice_id: sourceNoticeId,
    source_url: `${source.url}/notices/${1000 + i}`,
    source_hash: createHash("sha256").update(sourceNoticeId + title).digest("hex"),
    title_original: title,
    language_original: isFr ? "fr" : "en",
    title_en: title,
    summary_en: faker.lorem.paragraphs({ min: 1, max: 2 }),
    country: countryInfo.code,
    city: faker.helpers.arrayElement(CITIES[countryInfo.code] ?? ["Central"]),
    buyer_id: buyer?.id ?? null,
    buyer_name_raw: buyer?.name ?? null,
    funder_name: source.country === null ? source.name : null,
    sector_primary: sector,
    keywords: title
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 4)
      .slice(0, 6),
    notice_type: faker.helpers.arrayElement(["tender", "rfp", "rfq", "eoi"]),
    procurement_method: faker.helpers.arrayElement(["open", "restricted", "quotation"]),
    published_at: publishedAt.toISOString(),
    closing_at: closingAt.toISOString(),
    estimated_value_max: String(valueLocal),
    currency: countryInfo.currency,
    value_usd_est: String(valueUsd),
    documents_count: faker.number.int({ min: 0, max: 4 }),
    status,
    extraction_confidence: confidence,
    quality_score: faker.number.float({ min: 0.4, max: 1, fractionDigits: 2 }),
    is_published: confidence >= 0.7,
    first_seen_at: publishedAt.toISOString(),
    last_seen_at: new Date().toISOString(),
  });
}

writeFileSync(join(outDir, "sources.json"), JSON.stringify(sourceIds, null, 2));
writeFileSync(join(outDir, "buyers.json"), JSON.stringify(buyers));
writeFileSync(join(outDir, "tenders.json"), JSON.stringify(tenders));
console.log(
  `wrote ${buyers.length} buyers, ${tenders.length} tenders to ${outDir}`
);
