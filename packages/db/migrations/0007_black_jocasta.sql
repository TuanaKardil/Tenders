CREATE TYPE "public"."mapping_origin" AS ENUM('static', 'ai', 'human');--> statement-breakpoint
CREATE TYPE "public"."mapping_status" AS ENUM('active', 'pending_review');--> statement-breakpoint
CREATE TABLE "notice_type_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_slug" text,
	"raw_text" text NOT NULL,
	"mapped_enum" "notice_type" NOT NULL,
	"confidence" real,
	"origin" "mapping_origin" NOT NULL,
	"status" "mapping_status" DEFAULT 'active' NOT NULL,
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notice_type_mappings_uq" ON "notice_type_mappings" USING btree ("source_slug","raw_text");