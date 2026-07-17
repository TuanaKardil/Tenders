import type { IngestNotice } from "@repo/config/ingest";
import { parseFullIso, isRecentAndOpen } from "./shared";

/**
 * Ethiopia eGP — the Angular SPA's JSON API (grouped sourcing).
 * GET /po-gw/cms-v2/api/sourcing/get-grouped-sourcing returns open lots.
 */
const BASE = "https://production.egp.gov.et";
const UA = "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36";

const CATEGORY_SECTOR: Record<string, string> = {
  goods: "goods",
  works: "construction",
  services: "consulting",
  consultancy: "consulting",
  "consultancy services": "consulting",
  "non-consultancy services": "consulting",
};

interface EtLot {
  id: string;
  lotName?: string;
  lotDescription?: string;
  procurementReferenceNo?: string;
  lotReferenceNo?: string;
  procurementCategory?: string;
  submissionDeadline?: string;
  invitationDate?: string;
  method?: string;
  procuringEntity?: string;
  language?: string;
}

export async function fetchEthiopia(): Promise<IngestNotice[]> {
  const url = `${BASE}/po-gw/cms-v2/api/sourcing/get-grouped-sourcing?type=all&skip=0&top=60&locale=en&orderBy%5B0%5D.field=invitationDate&orderBy%5B0%5D.direction=desc`;

  let items: { result?: EtLot[] }[] = [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: { result?: EtLot[] }[] };
    items = json.items ?? [];
  } catch {
    return [];
  }

  const out: IngestNotice[] = [];
  const seen = new Set<string>();

  for (const pkg of items) {
    for (const lot of pkg.result ?? []) {
      const title = (lot.lotName ?? lot.lotDescription)?.replace(/\s+/g, " ").trim();
      const ref = lot.procurementReferenceNo || lot.lotReferenceNo || lot.id;
      if (!title || title.length < 3 || seen.has(ref)) continue;

      const publishedIso = parseFullIso(lot.invitationDate);
      const closingIso = parseFullIso(lot.submissionDeadline);
      if (!isRecentAndOpen(publishedIso, closingIso)) continue;

      seen.add(ref);
      out.push({
        source_slug: "et-egp",
        source_notice_id: ref,
        source_url: `${BASE}/egp/bids/${lot.id}`,
        title: title.slice(0, 400),
        language: lot.language === "en" ? "en" : undefined,
        country: "ET",
        buyer_name: lot.procuringEntity?.trim() || undefined,
        sector: lot.procurementCategory
          ? CATEGORY_SECTOR[lot.procurementCategory.toLowerCase()]
          : undefined,
        notice_type: lot.method || undefined,
        published_at: publishedIso,
        closing_at: closingIso,
      });
    }
  }

  return out;
}
