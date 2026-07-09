CREATE TYPE "public"."alert_channel" AS ENUM('email');--> statement-breakpoint
CREATE TYPE "public"."alert_delivery_status" AS ENUM('sent', 'failed', 'skipped_empty');--> statement-breakpoint
CREATE TYPE "public"."alert_frequency" AS ENUM('instant', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."buyer_type" AS ENUM('government', 'soe', 'ngo', 'dfi', 'private');--> statement-breakpoint
CREATE TYPE "public"."dedupe_method" AS ENUM('hash', 'fuzzy', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ingestion_run_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."license_class" AS ENUM('green', 'yellow', 'red');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'tr');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'pro');--> statement-breakpoint
CREATE TYPE "public"."raw_notice_status" AS ENUM('received', 'normalized', 'failed', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'trialing', 'past_due', 'canceled', 'paused');--> statement-breakpoint
CREATE TYPE "public"."takedown_action" AS ENUM('unpublished', 'source_disabled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."tender_status" AS ENUM('open', 'closing_soon', 'closed', 'cancelled', 'awarded');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"country" char(2),
	"buyer_type" "buyer_type",
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"country" char(2),
	"license_class" "license_class" DEFAULT 'yellow' NOT NULL,
	"cadence" text DEFAULT '24h' NOT NULL,
	"scraper_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "dedupe_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_tender_id" uuid,
	"method" "dedupe_method" DEFAULT 'hash' NOT NULL,
	"confidence" real,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"title" text,
	"url" text NOT NULL,
	"file_type" text,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "featured_tenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "featured_tenders_tender_id_unique" UNIQUE("tender_id")
);
--> statement-breakpoint
CREATE TABLE "tenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_notice_id" text NOT NULL,
	"source_url" text NOT NULL,
	"source_hash" text NOT NULL,
	"title_original" text NOT NULL,
	"language_original" char(2) DEFAULT 'en' NOT NULL,
	"title_en" text,
	"title_tr" text,
	"summary_en" text,
	"summary_tr" text,
	"country" char(2) NOT NULL,
	"region" text,
	"city" text,
	"buyer_id" uuid,
	"buyer_name_raw" text,
	"funder_name" text,
	"sector_primary" text,
	"sectors_secondary" text[] DEFAULT '{}' NOT NULL,
	"cpv_codes" text[] DEFAULT '{}' NOT NULL,
	"unspsc_codes" text[] DEFAULT '{}' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"notice_type" text,
	"procurement_method" text,
	"contract_type" text,
	"published_at" timestamp with time zone,
	"closing_at" timestamp with time zone,
	"question_deadline" timestamp with time zone,
	"estimated_value_min" numeric,
	"estimated_value_max" numeric,
	"currency" char(3),
	"value_usd_est" numeric,
	"eligibility_countries" text[] DEFAULT '{}' NOT NULL,
	"eligibility_notes_en" text,
	"documents_count" integer DEFAULT 0 NOT NULL,
	"status" "tender_status" DEFAULT 'open' NOT NULL,
	"dedupe_cluster_id" uuid,
	"extraction_confidence" real,
	"quality_score" real,
	"is_published" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenders_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "ingestion_run_status" DEFAULT 'running' NOT NULL,
	"counts" jsonb DEFAULT '{"received":0,"created":0,"updated":0,"failed":0,"duplicates":0}'::jsonb NOT NULL,
	"scraper_version" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "raw_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"ingestion_run_id" uuid,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "raw_notice_status" DEFAULT 'received' NOT NULL,
	"error" text,
	"tender_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"paddle_customer_id" text,
	"paddle_subscription_id" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_paddle_subscription_id_unique" UNIQUE("paddle_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_search_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "alert_channel" DEFAULT 'email' NOT NULL,
	"tender_ids" uuid[] DEFAULT '{}' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resend_message_id" text,
	"status" "alert_delivery_status" DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirect_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"user_id" uuid,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"referrer" text,
	"ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"alert_enabled" boolean DEFAULT false NOT NULL,
	"frequency" "alert_frequency" DEFAULT 'weekly' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takedown_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"tender_id" uuid,
	"requester" text NOT NULL,
	"reason" text NOT NULL,
	"action" "takedown_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dedupe_clusters" ADD CONSTRAINT "dedupe_clusters_canonical_tender_id_tenders_id_fk" FOREIGN KEY ("canonical_tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_tenders" ADD CONSTRAINT "featured_tenders_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_dedupe_cluster_id_dedupe_clusters_id_fk" FOREIGN KEY ("dedupe_cluster_id") REFERENCES "public"."dedupe_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_notices" ADD CONSTRAINT "raw_notices_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_notices" ADD CONSTRAINT "raw_notices_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_notices" ADD CONSTRAINT "raw_notices_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirect_clicks" ADD CONSTRAINT "redirect_clicks_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirect_clicks" ADD CONSTRAINT "redirect_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_log" ADD CONSTRAINT "takedown_log_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takedown_log" ADD CONSTRAINT "takedown_log_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_tender_idx" ON "documents" USING btree ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenders_source_notice_uq" ON "tenders" USING btree ("source_id","source_notice_id");--> statement-breakpoint
CREATE INDEX "tenders_country_idx" ON "tenders" USING btree ("country");--> statement-breakpoint
CREATE INDEX "tenders_sector_idx" ON "tenders" USING btree ("sector_primary");--> statement-breakpoint
CREATE INDEX "tenders_status_idx" ON "tenders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenders_closing_at_idx" ON "tenders" USING btree ("closing_at");--> statement-breakpoint
CREATE INDEX "tenders_published_at_idx" ON "tenders" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "tenders_is_published_idx" ON "tenders" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_idx" ON "ingestion_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_notices_payload_hash_uq" ON "raw_notices" USING btree ("source_id","payload_hash");--> statement-breakpoint
CREATE INDEX "raw_notices_status_idx" ON "raw_notices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alert_deliveries_search_idx" ON "alert_deliveries" USING btree ("saved_search_id","sent_at");--> statement-breakpoint
CREATE INDEX "redirect_clicks_tender_idx" ON "redirect_clicks" USING btree ("tender_id","clicked_at");--> statement-breakpoint
CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_tender_uq" ON "watchlist_items" USING btree ("user_id","tender_id");