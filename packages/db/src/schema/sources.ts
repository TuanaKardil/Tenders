import {
  pgTable,
  uuid,
  text,
  char,
  boolean,
  timestamp,
  real,
} from "drizzle-orm/pg-core";
import { licenseClassEnum, buyerTypeEnum } from "./enums";

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  /** ISO2; null = multi-country source (e.g. AfDB). */
  country: char("country", { length: 2 }),
  licenseClass: licenseClassEnum("license_class").notNull().default("yellow"),
  /** Expected scrape cadence, e.g. "6h", "24h". */
  cadence: text("cadence").notNull().default("24h"),
  /** Identifier the Python scraper sends as source_slug. */
  scraperKey: text("scraper_key"),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  /** 30-day rolling avg documents_count per tender — the baseline for the coverage anomaly alarm. */
  avgDocsPerTender30d: real("avg_docs_per_tender_30d"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const buyers = pgTable("buyers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Lowercased, punctuation-stripped key for entity resolution. */
  nameNormalized: text("name_normalized").notNull(),
  country: char("country", { length: 2 }),
  buyerType: buyerTypeEnum("buyer_type"),
  website: text("website"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
