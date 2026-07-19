import { pgEnum } from "drizzle-orm/pg-core";

export const tenderStatusEnum = pgEnum("tender_status", [
  "open",
  "closing_soon",
  "closed",
  "cancelled",
  "awarded",
]);

export const licenseClassEnum = pgEnum("license_class", ["green", "yellow", "red"]);

export const buyerTypeEnum = pgEnum("buyer_type", [
  "government",
  "soe",
  "ngo",
  "dfi",
  "private",
]);

export const rawNoticeStatusEnum = pgEnum("raw_notice_status", [
  "received",
  "normalized",
  "failed",
  "duplicate",
]);

export const ingestionRunStatusEnum = pgEnum("ingestion_run_status", [
  "running",
  "success",
  "partial",
  "failed",
]);

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const localeEnum = pgEnum("locale", ["en", "tr"]);

export const planEnum = pgEnum("plan", ["free", "starter", "pro"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "paused",
]);

export const alertFrequencyEnum = pgEnum("alert_frequency", [
  "instant",
  "daily",
  "weekly",
]);

export const alertChannelEnum = pgEnum("alert_channel", ["email"]);

export const alertDeliveryStatusEnum = pgEnum("alert_delivery_status", [
  "sent",
  "failed",
  "skipped_empty",
]);

export const dedupeMethodEnum = pgEnum("dedupe_method", ["hash", "fuzzy", "manual"]);

/** Where a notice-type mapping came from. */
export const mappingOriginEnum = pgEnum("mapping_origin", ["static", "ai", "human"]);

/** Lifecycle of a notice-type mapping. */
export const mappingStatusEnum = pgEnum("mapping_status", ["active", "pending_review"]);

/** Canonical notice type — raw source text is normalized into this (see @repo/config/notice-type). */
export const noticeTypeEnum = pgEnum("notice_type", [
  "tender",
  "rfp",
  "rfq",
  "eoi",
  "prequalification",
  "award",
  "cancellation",
  "disposal",
  "vacancy",
  "amendment",
  "unknown",
]);

export const takedownActionEnum = pgEnum("takedown_action", [
  "unpublished",
  "source_disabled",
  "rejected",
]);
