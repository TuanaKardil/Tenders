import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { rawNoticeStatusEnum, ingestionRunStatusEnum } from "./enums";
import { sources } from "./sources";
import { tenders } from "./tenders";

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: ingestionRunStatusEnum("status").notNull().default("running"),
    /** { received, created, updated, failed, duplicates } */
    counts: jsonb("counts")
      .$type<{
        received: number;
        created: number;
        updated: number;
        failed: number;
        duplicates: number;
      }>()
      .notNull()
      .default({ received: 0, created: 0, updated: 0, failed: 0, duplicates: 0 }),
    scraperVersion: text("scraper_version"),
    error: text("error"),
  },
  (t) => [index("ingestion_runs_source_idx").on(t.sourceId, t.startedAt)]
);

export const rawNotices = pgTable(
  "raw_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    ingestionRunId: uuid("ingestion_run_id").references(() => ingestionRuns.id),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: rawNoticeStatusEnum("status").notNull().default("received"),
    error: text("error"),
    tenderId: uuid("tender_id").references(() => tenders.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("raw_notices_payload_hash_uq").on(t.sourceId, t.payloadHash),
    index("raw_notices_status_idx").on(t.status),
  ]
);
