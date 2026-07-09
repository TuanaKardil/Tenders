import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  alertFrequencyEnum,
  alertChannelEnum,
  alertDeliveryStatusEnum,
} from "./enums";
import { users } from "./users";
import { tenders } from "./tenders";

/** Serialized search filters — mirrors the /search URL state. */
export interface SavedSearchQuery {
  q?: string;
  countries?: string[];
  sectors?: string[];
  status?: string[];
  sources?: string[];
  valueMin?: number;
  valueMax?: number;
  closingBefore?: string;
  language?: string;
}

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: jsonb("query").$type<SavedSearchQuery>().notNull().default({}),
    alertEnabled: boolean("alert_enabled").notNull().default(false),
    frequency: alertFrequencyEnum("frequency").notNull().default("weekly"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastResultCount: integer("last_result_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("saved_searches_user_idx").on(t.userId)]
);

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_user_tender_uq").on(t.userId, t.tenderId)]
);

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    savedSearchId: uuid("saved_search_id")
      .notNull()
      .references(() => savedSearches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: alertChannelEnum("channel").notNull().default("email"),
    tenderIds: uuid("tender_ids").array().notNull().default([]),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    resendMessageId: text("resend_message_id"),
    status: alertDeliveryStatusEnum("status").notNull().default("sent"),
  },
  (t) => [index("alert_deliveries_search_idx").on(t.savedSearchId, t.sentAt)]
);

export const redirectClicks = pgTable(
  "redirect_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderId: uuid("tender_id")
      .notNull()
      .references(() => tenders.id, { onDelete: "cascade" }),
    /** Nullable — anonymous clicks are tracked too. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
    referrer: text("referrer"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
  },
  (t) => [index("redirect_clicks_tender_idx").on(t.tenderId, t.clickedAt)]
);
