import {
  pgTable,
  uuid,
  text,
  char,
  boolean,
  timestamp,
  integer,
  numeric,
  real,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { tenderStatusEnum, dedupeMethodEnum, noticeTypeEnum } from "./enums";
import { sources, buyers } from "./sources";

export const tenders = pgTable(
  "tenders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),

    // Source identity
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    sourceNoticeId: text("source_notice_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    /** Hash of the normalized payload for change detection. */
    sourceHash: text("source_hash").notNull(),

    // Titles & summaries
    titleOriginal: text("title_original").notNull(),
    /** ISO 639-1. */
    languageOriginal: char("language_original", { length: 2 }).notNull().default("en"),
    titleEn: text("title_en"),
    titleTr: text("title_tr"),
    summaryEn: text("summary_en"),
    summaryTr: text("summary_tr"),

    // Geography
    country: char("country", { length: 2 }).notNull(),
    region: text("region"),
    city: text("city"),

    // Parties
    buyerId: uuid("buyer_id").references(() => buyers.id),
    buyerNameRaw: text("buyer_name_raw"),
    funderName: text("funder_name"),

    // Classification
    sectorPrimary: text("sector_primary"),
    sectorsSecondary: text("sectors_secondary").array().notNull().default([]),
    cpvCodes: text("cpv_codes").array().notNull().default([]),
    unspscCodes: text("unspsc_codes").array().notNull().default([]),
    keywords: text("keywords").array().notNull().default([]),
    /** Canonical enum, filled by @repo/config normalizeNoticeType() from notice_type_raw. */
    noticeType: noticeTypeEnum("notice_type"),
    /** Original source text (e.g. "Open Tender", "cn-standard"); kept so we can re-map. */
    noticeTypeRaw: text("notice_type_raw"),
    procurementMethod: text("procurement_method"),
    contractType: text("contract_type"),

    // Dates
    publishedAt: timestamp("published_at", { withTimezone: true }),
    closingAt: timestamp("closing_at", { withTimezone: true }),
    questionDeadline: timestamp("question_deadline", { withTimezone: true }),

    // Value
    estimatedValueMin: numeric("estimated_value_min"),
    estimatedValueMax: numeric("estimated_value_max"),
    currency: char("currency", { length: 3 }),
    valueUsdEst: numeric("value_usd_est"),

    // Eligibility
    eligibilityCountries: text("eligibility_countries").array().notNull().default([]),
    eligibilityNotesEn: text("eligibility_notes_en"),

    documentsCount: integer("documents_count").notNull().default(0),

    // Lifecycle
    status: tenderStatusEnum("status").notNull().default("open"),
    dedupeClusterId: uuid("dedupe_cluster_id").references(
      (): AnyPgColumn => dedupeClusters.id
    ),
    /** Why this tender was unpublished (e.g. classification gate); null when fine. */
    unpublishReason: text("unpublish_reason"),
    /** 0..1 — below 0.7 lands in the admin review queue. */
    extractionConfidence: real("extraction_confidence"),
    qualityScore: real("quality_score"),
    isPublished: boolean("is_published").notNull().default(false),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenders_source_notice_uq").on(t.sourceId, t.sourceNoticeId),
    index("tenders_country_idx").on(t.country),
    index("tenders_sector_idx").on(t.sectorPrimary),
    index("tenders_status_idx").on(t.status),
    index("tenders_closing_at_idx").on(t.closingAt),
    index("tenders_published_at_idx").on(t.publishedAt),
    index("tenders_is_published_idx").on(t.isPublished),
  ]
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    title: text("title"),
    /** Link only — the file itself is NEVER hosted; we keep only extracted text. */
    url: text("url").notNull(),
    fileType: text("file_type"),
    sizeBytes: integer("size_bytes"),
    /** Full extracted text (never truncated); null until extraction runs. */
    extractedText: text("extracted_text"),
    /** How the text was obtained: pdf-parse | mammoth | gemini-multimodal | failed. */
    extractionMethod: text("extraction_method"),
    /** Failure reason when extraction_method = 'failed'. */
    extractionError: text("extraction_error"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_tender_idx").on(t.tenderId)]
);

export const dedupeClusters = pgTable("dedupe_clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalTenderId: uuid("canonical_tender_id").references(
    (): AnyPgColumn => tenders.id
  ),
  method: dedupeMethodEnum("method").notNull().default("hash"),
  confidence: real("confidence"),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featuredTenders = pgTable("featured_tenders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenderId: uuid("tender_id")
    .notNull()
    .unique()
    .references(() => tenders.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
