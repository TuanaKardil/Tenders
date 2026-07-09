/**
 * Emits the seed as plain SQL (multi-row INSERTs) for environments where we
 * can execute SQL but have no direct connection string (e.g. Supabase MCP).
 * Usage: tsx seed/generate-sql.ts > /tmp/seed.sql
 */
import { createHash, randomUUID } from "node:crypto";
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

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function q(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function arr(values: string[]): string {
  if (values.length === 0) return "'{}'";
  return `ARRAY[${values.map((v) => q(v)).join(",")}]::text[]`;
}

function ts(date: Date): string {
  return `'${date.toISOString()}'`;
}

function fillTemplate(template: string, country: string): string {
  const cities = CITIES[country] ?? ["Central"];
  return template
    .replace("{place2}", faker.helpers.arrayElement(cities))
    .replace("{place}", faker.helpers.arrayElement(cities))
    .replace("{n}", String(faker.number.int({ min: 2, max: 120 })));
}

const out: string[] = [];

// --- sources ---
const sourceIds = new Map<string, string>();
const sourceValues = SEED_SOURCES.map((s) => {
  const id = randomUUID();
  sourceIds.set(s.slug, id);
  return `(${q(id)}, ${q(s.slug)}, ${q(s.name)}, ${q(s.url)}, ${q(s.country)}, ${q(s.licenseClass)}, ${q(s.cadence)}, ${q(s.slug)}, true)`;
});
out.push(
  `INSERT INTO sources (id, slug, name, url, country, license_class, cadence, scraper_key, is_active) VALUES\n${sourceValues.join(",\n")}\nON CONFLICT (slug) DO NOTHING;`
);

// --- buyers ---
interface SeedBuyer {
  id: string;
  name: string;
  country: string;
}
const buyerRows: SeedBuyer[] = [];
const buyerValues: string[] = [];
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
    const buyerType = faker.helpers.arrayElement([
      "government",
      "government",
      "government",
      "soe",
      "ngo",
    ]);
    buyerValues.push(
      `(${q(id)}, ${q(slug)}, ${q(name)}, ${q(name.toLowerCase().replace(/[^a-z0-9 ]/g, ""))}, ${q(code)}, ${q(buyerType)})`
    );
  }
}
out.push(
  `INSERT INTO buyers (id, slug, name, name_normalized, country, buyer_type) VALUES\n${buyerValues.join(",\n")}\nON CONFLICT (slug) DO NOTHING;`
);

// --- tenders ---
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const tenderValues: string[] = [];

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
  const description = faker.lorem.paragraphs({ min: 1, max: 2 });
  const isFr = ["SN", "CI", "CM", "MA"].includes(countryInfo.code);
  const keywords = title
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 4)
    .slice(0, 6);

  tenderValues.push(
    `(${q(`${slugify(title)}-${faker.string.alphanumeric(6).toLowerCase()}`)}, ` +
      `${q(sourceIds.get(source.slug)!)}, ${q(sourceNoticeId)}, ` +
      `${q(`${source.url}/notices/${1000 + i}`)}, ` +
      `${q(createHash("sha256").update(sourceNoticeId + title).digest("hex"))}, ` +
      `${q(title)}, ${q(isFr ? "fr" : "en")}, ${q(title)}, ${q(description)}, ` +
      `${q(countryInfo.code)}, ${q(faker.helpers.arrayElement(CITIES[countryInfo.code] ?? ["Central"]))}, ` +
      `${buyer ? q(buyer.id) : "NULL"}, ${buyer ? q(buyer.name) : "NULL"}, ` +
      `${source.country === null ? q(source.name) : "NULL"}, ${q(sector)}, ${arr(keywords)}, ` +
      `${q(faker.helpers.arrayElement(["tender", "rfp", "rfq", "eoi"]))}, ` +
      `${q(faker.helpers.arrayElement(["open", "restricted", "quotation"]))}, ` +
      `${ts(publishedAt)}, ${ts(closingAt)}, ` +
      `${valueLocal}, ${q(countryInfo.currency)}, ${valueUsd}, ` +
      `${faker.number.int({ min: 0, max: 4 })}, ${q(status)}, ` +
      `${confidence}, ${faker.number.float({ min: 0.4, max: 1, fractionDigits: 2 })}, ` +
      `${confidence >= 0.7}, ${ts(publishedAt)}, ${ts(new Date())})`
  );
}

const tenderCols =
  "slug, source_id, source_notice_id, source_url, source_hash, title_original, language_original, title_en, summary_en, country, city, buyer_id, buyer_name_raw, funder_name, sector_primary, keywords, notice_type, procurement_method, published_at, closing_at, estimated_value_max, currency, value_usd_est, documents_count, status, extraction_confidence, quality_score, is_published, first_seen_at, last_seen_at";

// chunk tenders into batches of 50 to keep statements manageable
for (let i = 0; i < tenderValues.length; i += 50) {
  out.push(
    `INSERT INTO tenders (${tenderCols}) VALUES\n${tenderValues
      .slice(i, i + 50)
      .join(",\n")}\nON CONFLICT (slug) DO NOTHING;`
  );
}

console.log(out.join("\n\n"));
