import { config } from "dotenv";
config({ path: "../../.env" });
config({ path: "../../.env.local" });

import { createHash } from "node:crypto";
import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { db } from "../src/client";
import { sources, buyers, tenders } from "../src/schema/index";
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

function fillTemplate(template: string, country: string): string {
  const cities = CITIES[country] ?? ["Central"];
  return template
    .replace("{place2}", faker.helpers.arrayElement(cities))
    .replace("{place}", faker.helpers.arrayElement(cities))
    .replace("{n}", String(faker.number.int({ min: 2, max: 120 })));
}

async function main() {
  console.log("Seeding sources...");
  const sourceRows: (typeof sources.$inferSelect)[] = [];
  for (const s of SEED_SOURCES) {
    const [row] = await db
      .insert(sources)
      .values({ ...s, scraperKey: s.slug, isActive: true })
      .onConflictDoUpdate({ target: sources.slug, set: { name: s.name } })
      .returning();
    if (row) sourceRows.push(row);
  }

  console.log("Seeding buyers...");
  const buyerRows: (typeof buyers.$inferSelect)[] = [];
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
      const [row] = await db
        .insert(buyers)
        .values({
          slug,
          name,
          nameNormalized: name.toLowerCase().replace(/[^a-z0-9 ]/g, ""),
          country: code,
          buyerType: faker.helpers.arrayElement([
            "government",
            "government",
            "government",
            "soe",
            "ngo",
          ] as const),
        })
        .onConflictDoNothing()
        .returning();
      if (row) buyerRows.push(row);
    }
  }
  const allBuyers =
    buyerRows.length > 0 ? buyerRows : await db.select().from(buyers);

  console.log(`Seeding ${TENDER_COUNT} tenders...`);
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  let created = 0;

  for (let i = 0; i < TENDER_COUNT; i++) {
    const countryInfo = faker.helpers.arrayElement(SEED_COUNTRIES);
    const sector = faker.helpers.arrayElement(sectorSlugs);
    const templates = SECTOR_TEMPLATES[sector] ?? [];
    const title = fillTemplate(faker.helpers.arrayElement(templates), countryInfo.code);

    // Multi-country funders (AfDB, UNDP, World Bank) get ~25% of notices.
    const source = faker.helpers.weightedArrayElement(
      sourceRows.map((s) => ({
        value: s,
        weight: s.country === null ? 1 : s.country === countryInfo.code ? 12 : 0.2,
      }))
    );

    const buyerPool = allBuyers.filter((b) => b.country === countryInfo.code);
    const buyer = buyerPool.length > 0 ? faker.helpers.arrayElement(buyerPool) : null;

    const publishedAt = new Date(now - faker.number.int({ min: 0, max: 45 }) * DAY);
    // Bias toward open tenders; some closed/closing soon for realistic statuses.
    const closingOffsetDays = faker.helpers.weightedArrayElement([
      { value: faker.number.int({ min: 8, max: 60 }), weight: 6 }, // open
      { value: faker.number.int({ min: 1, max: 7 }), weight: 2 }, // closing_soon
      { value: -faker.number.int({ min: 1, max: 20 }), weight: 2 }, // closed
    ]);
    const closingAt = new Date(now + closingOffsetDays * DAY);
    const status =
      closingOffsetDays < 0 ? "closed" : closingOffsetDays <= 7 ? "closing_soon" : "open";

    const valueLocal = faker.number.int({ min: 40, max: 5000 }) * 10_000;
    const valueUsd = Math.round(valueLocal * countryInfo.usdRate);
    const confidence = faker.number.float({ min: 0.5, max: 1, fractionDigits: 2 });

    const sourceNoticeId = `${source.slug.toUpperCase()}-${2026}-${1000 + i}`;
    const description = faker.lorem.paragraphs({ min: 1, max: 2 });

    await db
      .insert(tenders)
      .values({
        slug: `${slugify(title)}-${faker.string.alphanumeric(6).toLowerCase()}`,
        sourceId: source.id,
        sourceNoticeId,
        sourceUrl: `${source.url}/notices/${1000 + i}`,
        sourceHash: createHash("sha256").update(sourceNoticeId + title).digest("hex"),
        titleOriginal: title,
        languageOriginal: ["SN", "CI", "CM", "MA"].includes(countryInfo.code) ? "fr" : "en",
        titleEn: title,
        summaryEn: description,
        country: countryInfo.code,
        city: faker.helpers.arrayElement(CITIES[countryInfo.code] ?? ["Central"]),
        buyerId: buyer?.id ?? null,
        buyerNameRaw: buyer?.name ?? null,
        funderName: source.country === null ? source.name : null,
        sectorPrimary: sector,
        keywords: title
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter((w) => w.length > 4)
          .slice(0, 6),
        noticeType: faker.helpers.arrayElement(["tender", "rfp", "rfq", "eoi"]),
        procurementMethod: faker.helpers.arrayElement(["open", "restricted", "quotation"]),
        publishedAt,
        closingAt,
        estimatedValueMax: String(valueLocal),
        currency: countryInfo.currency,
        valueUsdEst: String(valueUsd),
        documentsCount: faker.number.int({ min: 0, max: 4 }),
        status,
        extractionConfidence: confidence,
        qualityScore: faker.number.float({ min: 0.4, max: 1, fractionDigits: 2 }),
        isPublished: confidence >= 0.7,
        firstSeenAt: publishedAt,
        lastSeenAt: new Date(),
      })
      .onConflictDoNothing();
    created++;
  }

  const total = await db.$count(tenders);
  const published = await db.$count(tenders, eq(tenders.isPublished, true));
  console.log(
    `Done. Inserted ~${created} tenders (table now: ${total} total, ${published} published).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
