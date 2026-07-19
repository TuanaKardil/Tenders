CREATE TABLE "document_coverage_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"run_id" uuid,
	"expected_count" integer NOT NULL,
	"actual_count" integer NOT NULL,
	"missed_urls" text[] DEFAULT '{}' NOT NULL,
	"sampled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_coverage_audits" ADD CONSTRAINT "document_coverage_audits_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_coverage_audits_time_idx" ON "document_coverage_audits" USING btree ("sampled_at");