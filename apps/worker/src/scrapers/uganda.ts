import * as cheerio from "cheerio";
import type { IngestNotice } from "@repo/config/ingest";
import { fetchHtml, parseIsoDate, isRecentAndOpen } from "./shared";

/**
 * Uganda eGP — server-rendered HTML table of bid notices.
 * Columns: Procuring Entity | Type | Subject | Published | Deadline | Actions,
 * each row linking to /bid/notice/{id}/opening/details.
 */
const BASE = "https://egpuganda.go.ug";

export async function fetchUganda(): Promise<IngestNotice[]> {
  const html = await fetchHtml(`${BASE}/bid-notices`);
  const $ = cheerio.load(html);
  const out: IngestNotice[] = [];
  const seen = new Set<string>();

  $("tr").each((_, tr) => {
    const link = $(tr).find('a[href*="/bid/notice/"]').attr("href");
    if (!link) return;
    const idMatch = link.match(/\/bid\/notice\/(\d+)/);
    const id = idMatch?.[1];
    if (!id || seen.has(id)) return;

    const cells = $(tr)
      .find("td")
      .map((_, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();
    if (cells.length < 5) return;

    const [buyerRaw, type, subject, published, deadline] = cells;
    const title = subject?.trim();
    if (!title || title.length < 3) return;

    const publishedIso = parseIsoDate(published);
    const closingIso = parseIsoDate(deadline);
    if (!isRecentAndOpen(publishedIso, closingIso)) return;

    seen.add(id);
    out.push({
      source_slug: "ug-egp",
      source_notice_id: id,
      source_url: `${BASE}${link}`,
      title: title.slice(0, 400),
      language: "en",
      country: "UG",
      buyer_name: buyerRaw?.slice(0, 200) || undefined,
      notice_type: type?.trim() || undefined,
      published_at: publishedIso,
      closing_at: closingIso,
    });
  });

  return out;
}
