import * as cheerio from "cheerio";
import type { IngestNotice } from "@repo/config/ingest";
import { fetchHtml, nameToIso2, parseDmy, isRecentAndOpen } from "./shared";

/**
 * UN Global Marketplace — POST search returns server-rendered notice rows.
 * Each row: .resultTitle, .deadline, .resultAgency, .resultInfo1 (ref),
 * a plain cell with the published date and one with the country name,
 * and a data-noticeid attribute for the detail URL.
 */
const BASE = "https://www.ungm.org";

/**
 * UNGM sends no notice_type field, but its titles carry a clear type prefix
 * ("RFQ-...", "REQUEST FOR PROPOSAL...", "REOI:...", "Long-Term Arrangement").
 * Extract it so the dictionary can resolve it instead of everything falling to
 * unknown. Returns undefined when no pattern matches (→ dictionary/AI decide).
 */
export function extractUngmType(title: string): string | undefined {
  const t = title.toLowerCase();
  const has = (...res: RegExp[]) => res.some((re) => re.test(t));
  // Amendments/extensions of an existing notice — checked first.
  if (has(/\bprorogation\b/, /\bamendment\b/, /\baddendum\b/, /\bcorrigendum\b/)) return "amendment";
  if (has(/^rfq\b/, /\brequest for quotations?\b/, /\bdemande de (prix|cotation)/)) return "rfq";
  if (has(/^rfp\b/, /\brequest for proposals?\b/, /\bdemande de propositions?\b/)) return "rfp";
  if (has(/^reoi\b/, /^eoi\b/, /expression of interest/, /manifestation d[’']int[ée]r[êe]t/, /^appel [àa] consultation/))
    return "eoi";
  if (has(/^itb\b/, /invitation to bid/, /invitation to tender/, /^appel d[’']offres?/, /^avis d[’']appel d[’']offres?/))
    return "tender";
  if (has(/long[- ]term arrangement|\blta\b/)) return "tender";
  if (has(/\brfi\b/, /request for information/)) return "unknown"; // market research, not a solicitation
  return undefined;
}

export async function fetchUngm(): Promise<IngestNotice[]> {
  const body = JSON.stringify({
    PageIndex: 0,
    PageSize: 100,
    Title: "",
    Description: "",
    Reference: "",
    PublishedFrom: "",
    PublishedTo: "",
    DeadlineFrom: "",
    DeadlineTo: "",
    Countries: [],
    Agencies: [],
    UNSPSCs: [],
    NoticeTypes: [],
    SortField: "DatePublished",
    SortAscending: false,
  });

  const html = await fetchHtml(`${BASE}/Public/Notice/Search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE}/Public/Notice`,
    },
    body,
  });

  const $ = cheerio.load(html);
  const out: IngestNotice[] = [];

  $("[data-noticeid]").each((_, row) => {
    const $row = $(row);
    const id = $row.attr("data-noticeid");
    if (!id) return;

    const title = $row
      .find(".resultTitle")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .replace(/\s*Open in a new window\s*$/i, "")
      .trim();
    if (!title || title.length < 3) return;

    const deadlineText = $row.find(".deadline").first().text().trim();
    const agency = $row.find(".resultAgency").first().text().trim();

    // Plain cells: locate the published date (DD-Mon-YYYY) and the country name.
    const cellTexts = $row
      .find(".tableCell")
      .map((_, c) => $(c).text().replace(/\s+/g, " ").trim())
      .get();

    const noticeTypeRaw = extractUngmType(title);
    const closingIso = parseDmy(deadlineText);
    let publishedIso: string | undefined;
    let country: string | undefined;
    for (const text of cellTexts) {
      if (!publishedIso && /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(text) && text !== deadlineText) {
        publishedIso = parseDmy(text);
      }
      if (!country) country = nameToIso2(text);
    }

    if (!isRecentAndOpen(publishedIso, closingIso)) return;

    out.push({
      source_slug: "ungm",
      // The stable id is the data-noticeid (also in the URL). The old code
      // used .resultInfo1, which actually holds the deadline text plus a
      // per-scrape changing number → a new row every refresh (duplicates).
      source_notice_id: id,
      source_url: `${BASE}/Public/Notice/${id}`,
      title: title.slice(0, 400),
      country,
      buyer_name: agency || undefined,
      funder_name: agency || undefined,
      notice_type: noticeTypeRaw,
      published_at: publishedIso,
      closing_at: closingIso,
    });
  });

  return out;
}
