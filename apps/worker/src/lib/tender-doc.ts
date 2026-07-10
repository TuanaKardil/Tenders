import type { TenderDoc } from "@repo/config/search";
import type { tenders, sources } from "@repo/db/schema";

type TenderRow = typeof tenders.$inferSelect;
type SourceRow = typeof sources.$inferSelect;

function toUnix(date: Date | null): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

function truncate(text: string | null, max = 400): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Flattens a tender row (+ its source) into the Meilisearch document. */
export function tenderToDoc(tender: TenderRow, source: SourceRow): TenderDoc {
  return {
    id: tender.id,
    slug: tender.slug,
    title_en: tender.titleEn ?? tender.titleOriginal,
    title_tr: tender.titleTr,
    title_original: tender.titleOriginal,
    summary_en: truncate(tender.summaryEn),
    summary_tr: truncate(tender.summaryTr),
    buyer_name: tender.buyerNameRaw,
    funder_name: tender.funderName,
    keywords: tender.keywords,
    cpv_codes: tender.cpvCodes,
    country: tender.country,
    region: tender.region,
    city: tender.city,
    sector_primary: tender.sectorPrimary,
    sectors_secondary: tender.sectorsSecondary,
    status: tender.status,
    source_slug: source.slug,
    language_original: tender.languageOriginal,
    notice_type: tender.noticeType,
    procurement_method: tender.procurementMethod,
    published_at: toUnix(tender.publishedAt),
    closing_at: toUnix(tender.closingAt),
    value_usd_est: tender.valueUsdEst ? Number(tender.valueUsdEst) : null,
    has_documents: tender.documentsCount > 0,
    quality_score: tender.qualityScore ?? 0,
  };
}
