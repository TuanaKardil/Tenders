import type { IngestNotice } from "@repo/config/ingest";
import { parseSpaceDateTime, isRecentAndOpen } from "./shared";

/**
 * Kenya PPIP (tenders.go.ke) — the Vue SPA's hidden JSON API.
 * GET /api/active-tenders returns Laravel-paginated open tenders.
 */
const BASE = "https://tenders.go.ke";
const UA = "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36";

const CATEGORY_SECTOR: Record<string, string> = {
  works: "construction",
  goods: "goods",
  services: "consulting",
  consultancy: "consulting",
  "consultancy services": "consulting",
  "non consultancy services": "consulting",
};

interface KeDocument {
  url?: string;
  description?: string;
  type?: { description?: string };
}

interface KeTender {
  id: number;
  tender_ref?: string;
  title?: string;
  published_at?: string;
  close_at?: string;
  description?: string | null;
  pe?: { name?: string };
  procurement_method?: { title?: string };
  procurement_category?: { title?: string; code?: string };
  documents?: KeDocument[];
}

/** Extension → file_type; used to tag attachments so extraction can route them. */
function fileTypeFromUrl(url: string): string | undefined {
  const m = url.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\?|#|$)/);
  return m ? m[1] : undefined;
}

/** Map Kenya's documents[] to ingest attachments (relative → absolute URL). */
function keDocuments(docs: KeDocument[] | undefined) {
  if (!docs?.length) return undefined;
  const out = docs
    .map((d) => {
      if (!d.url) return null;
      const url = d.url.startsWith("http") ? d.url : `${BASE}${d.url.startsWith("/") ? "" : "/"}${d.url}`;
      return { title: d.description || d.type?.description || undefined, url, file_type: fileTypeFromUrl(url) };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  return out.length > 0 ? out : undefined;
}

export async function fetchKenya(): Promise<IngestNotice[]> {
  const out: IngestNotice[] = [];

  for (let page = 1; page <= 3; page++) {
    const url = `${BASE}/api/active-tenders?search=&perpage=50&sortby=published_at&order=desc&page=${page}&published_at=`;
    let rows: KeTender[] = [];
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) break;
      const json = (await res.json()) as { data?: KeTender[] };
      rows = json.data ?? [];
    } catch {
      break;
    }
    if (rows.length === 0) break;

    for (const r of rows) {
      const title = r.title?.replace(/\s+/g, " ").trim();
      if (!title || title.length < 3) continue;

      const publishedIso = parseSpaceDateTime(r.published_at);
      const closingIso = parseSpaceDateTime(r.close_at);
      if (!isRecentAndOpen(publishedIso, closingIso)) continue;

      out.push({
        source_slug: "ke-ppip",
        source_notice_id: r.tender_ref || String(r.id),
        source_url: `${BASE}/tenders/${r.id}`,
        title: title.slice(0, 400),
        language: "en",
        country: "KE",
        buyer_name: r.pe?.name || undefined,
        description: r.description ?? undefined,
        sector: r.procurement_category?.code
          ? CATEGORY_SECTOR[r.procurement_category.code.toLowerCase()]
          : undefined,
        notice_type: r.procurement_method?.title || undefined,
        published_at: publishedIso,
        closing_at: closingIso,
        documents: keDocuments(r.documents),
      });
    }
  }

  return out;
}
