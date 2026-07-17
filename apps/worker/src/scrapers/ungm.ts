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
    const reference = $row.find(".resultInfo1").first().text().trim();

    // Plain cells: locate the published date (DD-Mon-YYYY) and the country name.
    const cellTexts = $row
      .find(".tableCell")
      .map((_, c) => $(c).text().replace(/\s+/g, " ").trim())
      .get();

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
      source_notice_id: reference || id,
      source_url: `${BASE}/Public/Notice/${id}`,
      title: title.slice(0, 400),
      country,
      buyer_name: agency || undefined,
      funder_name: agency || undefined,
      published_at: publishedIso,
      closing_at: closingIso,
    });
  });

  return out;
}
