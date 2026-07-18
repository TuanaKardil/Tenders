-- pgvector ships with Supabase but must be enabled once.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "dedupe_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_a_id" uuid NOT NULL,
	"tender_b_id" uuid NOT NULL,
	"similarity" real NOT NULL,
	"verdict" text,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_embeddings" (
	"tender_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dedupe_candidates" ADD CONSTRAINT "dedupe_candidates_tender_a_id_tenders_id_fk" FOREIGN KEY ("tender_a_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedupe_candidates" ADD CONSTRAINT "dedupe_candidates_tender_b_id_tenders_id_fk" FOREIGN KEY ("tender_b_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_embeddings" ADD CONSTRAINT "tender_embeddings_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dedupe_candidates_pair_uq" ON "dedupe_candidates" USING btree ("tender_a_id","tender_b_id");