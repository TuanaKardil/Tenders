import { z } from "zod";

/**
 * Contract for the external Python scraper service.
 * POST /api/ingest with header `x-api-key: $INGEST_API_KEY`.
 * Scrapers send "normalized-ish" notices; anything beyond the required
 * four fields is best-effort and refined by the extract/translate workers.
 */
export const ingestNoticeSchema = z.object({
  // Required identity
  source_slug: z.string().min(1),
  source_notice_id: z.string().min(1),
  source_url: z.string().url(),
  title: z.string().min(3),

  // Optional structured fields (pass through when the scraper has them)
  language: z.string().length(2).optional(),
  description: z.string().optional(),
  raw_text: z.string().optional(),
  country: z.string().length(2).optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  buyer_name: z.string().optional(),
  funder_name: z.string().optional(),
  sector: z.string().optional(),
  cpv_codes: z.array(z.string()).optional(),
  notice_type: z.string().optional(),
  procurement_method: z.string().optional(),
  contract_type: z.string().optional(),
  published_at: z.string().datetime({ offset: true }).optional(),
  closing_at: z.string().datetime({ offset: true }).optional(),
  question_deadline: z.string().datetime({ offset: true }).optional(),
  estimated_value_min: z.number().nonnegative().optional(),
  estimated_value_max: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  eligibility_countries: z.array(z.string().length(2)).optional(),
  eligibility_notes: z.string().optional(),
  documents: z
    .array(
      z.object({
        title: z.string().optional(),
        url: z.string().url(),
        file_type: z.string().optional(),
      })
    )
    .optional(),
});

export const ingestBatchSchema = z.object({
  run: z
    .object({
      scraper_version: z.string().optional(),
      started_at: z.string().datetime({ offset: true }).optional(),
    })
    .optional(),
  notices: z.array(ingestNoticeSchema).min(1).max(500),
});

export type IngestNotice = z.infer<typeof ingestNoticeSchema>;
export type IngestBatch = z.infer<typeof ingestBatchSchema>;
