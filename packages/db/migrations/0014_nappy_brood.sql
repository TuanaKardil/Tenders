CREATE TABLE "ai_answer_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"question_hash" text NOT NULL,
	"knowledge_version" text NOT NULL,
	"answer_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"question_hash" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost" real DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_answer_cache" ADD CONSTRAINT "ai_answer_cache_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_answer_cache_key_uq" ON "ai_answer_cache" USING btree ("tender_id","question_hash","knowledge_version");--> statement-breakpoint
CREATE INDEX "ai_usage_user_time_idx" ON "ai_usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_tender_idx" ON "ai_usage_events" USING btree ("tender_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_time_idx" ON "ai_usage_events" USING btree ("created_at");