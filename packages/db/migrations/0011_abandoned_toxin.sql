ALTER TABLE "alert_deliveries" ADD COLUMN "match_types" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "saved_searches" ADD COLUMN "embedding_updated_at" timestamp with time zone;