CREATE TYPE "public"."notice_type" AS ENUM('tender', 'rfp', 'rfq', 'eoi', 'prequalification', 'award', 'cancellation', 'disposal', 'vacancy', 'unknown');--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "notice_type_raw" text;--> statement-breakpoint
-- Preserve the original source text before we repurpose notice_type for the enum.
UPDATE "tenders" SET "notice_type_raw" = "notice_type" WHERE "notice_type" IS NOT NULL;--> statement-breakpoint
-- Clear notice_type (raw strings can't cast to the enum); the normalize backfill repopulates it from notice_type_raw.
ALTER TABLE "tenders" ALTER COLUMN "notice_type" SET DATA TYPE "public"."notice_type" USING NULL;
