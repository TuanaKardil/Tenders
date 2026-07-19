ALTER TABLE "tenders" ADD COLUMN "docs_merged_at" timestamp with time zone;--> statement-breakpoint
-- Existing rows are fully merged as of this migration; stamp them so only
-- documents extracted after this point mark a tender stale.
UPDATE "tenders" SET "docs_merged_at" = now();
