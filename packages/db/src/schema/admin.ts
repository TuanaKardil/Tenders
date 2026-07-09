import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { takedownActionEnum } from "./enums";
import { sources } from "./sources";
import { tenders } from "./tenders";

export const takedownLog = pgTable("takedown_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").references(() => sources.id),
  tenderId: uuid("tender_id").references(() => tenders.id),
  requester: text("requester").notNull(),
  reason: text("reason").notNull(),
  action: takedownActionEnum("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
