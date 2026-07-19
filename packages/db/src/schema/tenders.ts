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
  jsonb,
  index,
  uniqueIndex,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  tenderStatusEnum,
  dedupeMethodEnum,
  noticeTypeEnum,
  mappingOriginEnum,
  mappingStatusEnum,
} from "./enums";
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
    /** Notice type the AI field-extraction confirmed; compared against notice_type. */
    noticeTypeAi: text("notice_type_ai"),
    procurementMethod: text("procurement_method"),
    contractType: text("contract_type"),
    /** Per-lot breakdown (title, estimated value, award criteria, duration) — from TED etc. */
    lots: jsonb("lots")
      .$type<
        {
          title?: string;
          estimated_value?: number;
          currency?: string;
          award_criteria?: { name: string; weight?: number }[];
          duration?: string;
        }[]
      >(),

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
    /** Turkish rendering of the eligibility notes (derived in translate step). */
    eligibilityNotesTr: text("eligibility_notes_tr"),

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
    /**
     * Where each critical field's value came from:
     * "source_page" | "document" | "ai_page_text" | "manual".
     * Keys: closing_at, published_at, estimated_value, currency, buyer,
     * eligibility, notice_type. Written by the single merge function.
     */
    fieldProvenance: jsonb("field_provenance")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /**
     * Last time the AI pipeline consumed this tender's document texts.
     * A document extracted AFTER this timestamp marks the tender "stale":
     * the daily runs of extract-fields and translate-summarize pick it up
     * again automatically (self-healing for late-arriving attachments).
     */
    docsMergedAt: timestamp("docs_merged_at", { withTimezone: true }),
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

/**
 * Spot-check audit (6c): once per ingestion run, one random tender per
 * detail-fetch source has its detail page re-fetched and its document links
 * counted INDEPENDENTLY of the scraper — so a broken selector shows up as
 * expected_count > actual_count with the missed URLs recorded.
 */
export const documentCoverageAudits = pgTable(
  "document_coverage_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    /** ingestion_runs.id when available (null for manual audits). */
    runId: uuid("run_id"),
    /** Document links found on the live detail page. */
    expectedCount: integer("expected_count").notNull(),
    /** documents_count stored in the DB at audit time. */
    actualCount: integer("actual_count").notNull(),
    /** URLs present on the page but missing from the DB. */
    missedUrls: text("missed_urls").array().notNull().default([]),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("doc_coverage_audits_time_idx").on(t.sampledAt)]
);

export const dedupeClusters = pgTable("dedupe_clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The tender shown to users (primary); other members stay hidden from search. */
  canonicalTenderId: uuid("canonical_tender_id").references(
    (): AnyPgColumn => tenders.id
  ),
  method: dedupeMethodEnum("method").notNull().default("hash"),
  confidence: real("confidence"),
  reviewedBy: text("reviewed_by"),
  memberCount: integer("member_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Self-growing notice-type dictionary. Raw source phrases → canonical enum.
 * origin: 'static' (seeded from code), 'ai' (learned, confidence ≥ 0.8),
 * 'human' (admin approved/corrected). status 'pending_review' rows are AI
 * guesses below the confidence bar — they resolve to "unknown" until an admin
 * decides, and the same phrase is never re-asked while pending.
 */
export const noticeTypeMappings = pgTable(
  "notice_type_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = general rule that applies to every source. */
    sourceSlug: text("source_slug"),
    /** Normalized (lowercase, single-space) raw phrase. */
    rawText: text("raw_text").notNull(),
    mappedEnum: noticeTypeEnum("mapped_enum").notNull(),
    confidence: real("confidence"),
    origin: mappingOriginEnum("origin").notNull(),
    status: mappingStatusEnum("status").notNull().default("active"),
    /** AI's one-line reasoning (helps the admin review). */
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("notice_type_mappings_uq").on(t.sourceSlug, t.rawText)]
);

/**
 * RAG chunks for the tender QA assistant — built LAZILY on a tender's first
 * question from documents.extracted_text (~1000 chars, 150 overlap).
 * Separate from tender_embeddings (dedup/alerts) by design; embeddings here
 * use Gemini task types (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY).
 */
export const tenderDocumentChunks = pgTable(
  "tender_document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    pageNumber: integer("page_number"),
    sectionTitle: text("section_title"),
    language: char("language", { length: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tender_document_chunks_tender_idx").on(t.tenderId)]
);

/** Title+summary embedding per tender — Tier 2 dedup candidate generation. */
export const tenderEmbeddings = pgTable("tender_embeddings", {
  tenderId: uuid("tender_id")
    .primaryKey()
    .references(() => tenders.id, { onDelete: "cascade" }),
  /** text-embedding-004 (Google AI), 768 dims. */
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tier 2 judged pairs. status: 'merged' (auto), 'review' (judge said yes but
 * similarity < 0.90 — needs a human), 'rejected' (judge said no; kept so
 * re-runs don't re-judge the same pair).
 */
export const dedupeCandidates = pgTable(
  "dedupe_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderAId: uuid("tender_a_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    tenderBId: uuid("tender_b_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    similarity: real("similarity").notNull(),
    verdict: text("verdict"),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dedupe_candidates_pair_uq").on(t.tenderAId, t.tenderBId)]
);

/**
 * Tender QA usage ledger — Postgres-based quotas, rate limits, cost tracking
 * and abuse control (deliberately NO Redis). Counters are COUNT/SUM queries
 * over this table.
 */
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    tenderId: uuid("tender_id").notNull(),
    /** sha256 of model + normalized question. */
    questionHash: text("question_hash").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** USD, from the model's token pricing. */
    estimatedCost: real("estimated_cost").notNull().default(0),
    /** answered | not_found | out_of_scope | cached | error */
    status: text("status").notNull(),
    /** Request IP for per-IP rate limiting. */
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_user_time_idx").on(t.userId, t.createdAt),
    index("ai_usage_tender_idx").on(t.tenderId, t.createdAt),
    index("ai_usage_time_idx").on(t.createdAt),
  ]
);

/**
 * Tender QA answer cache. knowledge_version = tender.updated_at epoch +
 * document count — either changing invalidates naturally. 30-day TTL checked
 * at read time.
 */
export const aiAnswerCache = pgTable(
  "ai_answer_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    questionHash: text("question_hash").notNull(),
    knowledgeVersion: text("knowledge_version").notNull(),
    answerJson: jsonb("answer_json")
      .$type<{ status: string; language: string; answer: string; citations: unknown[] }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_answer_cache_key_uq").on(t.tenderId, t.questionHash, t.knowledgeVersion),
  ]
);

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
