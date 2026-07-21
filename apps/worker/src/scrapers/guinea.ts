import * as cheerio from "cheerio";
import type { IngestNotice } from "@repo/config/ingest";
import {
  DESCRIPTION_SNIPPET_MAX,
  type DetailPageData,
  type SourceConfig,
} from "@repo/config/source-contract";
import { fetchHtml, politeFetchHtml } from "./shared";

/**
 * Guinea — jaoguinee.com, "Journal des Appels d'Offres" (private notice
 * gazette, NOT an official portal). License class YELLOW → METADATA ONLY:
 * title, dates, URL, type phrase. We never store the notice body; attachments
 * are linked, never hosted. Only the /category/appels-d-offres/ category is
 * crawled — job-ads/results/communiqués categories are deliberately excluded.
 *
 * WordPress+Elementor listing: each card is
 *   <h3 class="elementor-post__title"><a href="…/DD/MM/YYYY/slug/ID/">TITLE</a></h3>
 * The URL carries the publication date and the numeric notice id.
 * No closing date on the list page → closing_at stays null (field extraction
 * may fill it later from the detail/PDF).
 */
const BASE = "https://www.jaoguinee.com";
const CATEGORY = `${BASE}/category/appels-d-offres/`;
const MAX_PAGES = 20;

/** Source-contract declaration (first source written against the contract). */
export const SOURCE_CONFIG: SourceConfig = {
  sourceSlug: "gn-jao",
  listPageStrategy: "wordpress-category",
  detailPageStrategy: "html",
  licenseClass: "yellow",
  requiresDetailFetch: true,
};

/** Recency window in days; first backfill can widen via GN_SINCE_DAYS. */
function windowDays(): number {
  const env = Number(process.env.GN_SINCE_DAYS);
  return Number.isFinite(env) && env > 0 ? env : 7;
}

/** French month names → 0-based month (for dates written in text). */
const FR_MONTHS: Record<string, number> = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10,
  décembre: 11, decembre: 11,
};

/** "17 juillet 2026" → ISO, or undefined. */
export function parseFrenchDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = value.trim().toLowerCase().match(/(\d{1,2})\s+([a-zû]+)\s+(\d{4})/i);
  if (!m || !m[1] || !m[2] || !m[3]) return undefined;
  const month = FR_MONTHS[m[2]];
  if (month === undefined) return undefined;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Notice-type phrase from the title. Ordered specific → generic. For the
 * generic recruitment phrases we keep the object of the recruitment (first 6
 * words) so the dictionary can learn e.g. "avis de recrutement de consultants"
 * (a consultancy procurement) separately from a plain job ad.
 */
const TYPE_PATTERNS: RegExp[] = [
  /^avis de sollicitation de propositions/,
  /^avis d[’']appel d[’']offres? (?:public|international|national)?/,
  /^appel d[’']offres? (?:public|international|national)?/,
  /^demande de prix/,
  /^demande de propositions?/,
  /^demande de cotations?/,
  /^manifestation d[’']int[ée]r[êe]ts?/,
  /^avis à manifestation d[’']int[ée]r[êe]ts?/,
  /^avis d[’']appel/,
];
const GENERIC_RECRUIT = /^(avis de recrutement|termes de reference|termes de référence|tdr)/;

export function extractTypeRaw(title: string): string {
  const t = title.toLowerCase().replace(/\s+/g, " ").trim();
  for (const re of TYPE_PATTERNS) {
    const m = t.match(re);
    if (m) return m[0].trim();
  }
  if (GENERIC_RECRUIT.test(t)) {
    // Keep the object: "avis de recrutement des entreprises de restauration…"
    return t.split(" ").slice(0, 6).join(" ");
  }
  // No known pattern — first 5 words; the dictionary learning flow handles it.
  return t.split(" ").slice(0, 5).join(" ");
}

/** Deadline phrases seen on the portal ("Date limite de remise des candidatures 31 Juillet 2026"). */
const DEADLINE_RES: RegExp[] = [
  /date limite[^.]{0,80}?(\d{1,2}(?:er)?\s+[a-zûé]+\s+\d{4})/i,
  /au plus tard le\s+(?:\w+\s+)?(\d{1,2}(?:er)?\s+[a-zûé]+\s+\d{4})/i,
  /avant le\s+(\d{1,2}(?:er)?\s+[a-zûé]+\s+\d{4})/i,
  /d[ée]lai de (?:remise|d[ée]p[ôo]t)[^.]{0,60}?(\d{1,2}(?:er)?\s+[a-zûé]+\s+\d{4})/i,
];

const DOC_EXT_RE = /\.(pdf|docx?|xlsx?)(?:\?|#|$)/i;

/**
 * Some jaoguinee posts publish the notice as EMBEDDED SCAN IMAGES in the body
 * (page-0001.jpg…) instead of attachments. Heuristic: uploads image, not a
 * site asset (logo/banner/_lwsoptimized), and either a page-N filename or a
 * large rendition (min side ≥ 500px). The -WxH thumbnail suffix is stripped
 * so the FULL-SIZE original goes to OCR.
 */
export function extractScanImages(html: string): string[] {
  const seen = new Set<string>();
  for (const m of html.matchAll(/<img[^>]*src="([^"]*wp-content\/uploads[^"]*)"/gi)) {
    let u = m[1]!;
    if (/_lwsoptimized|logo|banniere|armoirie|profile/i.test(u)) continue;
    const dim = u.match(/-(\d{2,4})x(\d{2,4})\.(jpe?g|png|webp)/i);
    const big = dim ? Math.min(Number(dim[1]), Number(dim[2])) >= 500 : false;
    const pageName = /page[-_]?\d+/i.test(u);
    if (!pageName && !big) continue;
    // strip WP thumbnail suffix → full-size original
    u = u.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp))/i, "$1");
    if (!u.startsWith("http")) u = `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
    seen.add(u);
  }
  return [...seen];
}

/**
 * Contract-standard detail fetch. Extracts closing date (when the body states
 * one), attachment links (absolute URLs) and a ≤300-char description snippet.
 * The full body is NEVER returned — yellow-license red line.
 */
export async function fetchDetail(url: string): Promise<DetailPageData> {
  const html = await politeFetchHtml(url);
  const $ = cheerio.load(html);

  // Content area only (skip nav/footer); Elementor post content widget.
  const content = $(".elementor-widget-theme-post-content").first();
  const scope = content.length ? content : $("body");
  const text = scope.text().replace(/\s+/g, " ").trim();

  // Closing date from body phrases; "1er" → "1".
  let closing: string | undefined;
  for (const re of DEADLINE_RES) {
    const m = text.match(re);
    if (m?.[1]) {
      closing = parseFrenchDate(m[1].replace(/(\d{1,2})er/, "$1"));
      if (closing) break;
    }
  }

  // Attachment links (dedupe, absolutize).
  const seen = new Set<string>();
  const documents: DetailPageData["documents"] = [];
  scope.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !DOC_EXT_RE.test(href)) return;
    const abs = href.startsWith("http") ? href : `${BASE}${href.startsWith("/") ? "" : "/"}${href}`;
    if (seen.has(abs)) return;
    seen.add(abs);
    const label = $(el).text().replace(/\s+/g, " ").trim();
    documents.push({
      title: label && label.length > 3 ? label.slice(0, 200) : undefined,
      url: abs,
      file_type: abs.toLowerCase().match(DOC_EXT_RE)?.[1],
    });
  });

  // Embedded notice scans (no attachment links on some posts) — never skip a document.
  for (const img of extractScanImages(html)) {
    if (seen.has(img)) continue;
    seen.add(img);
    documents.push({
      title: img.split("/").pop()?.slice(0, 200),
      url: img,
      file_type: img.toLowerCase().match(/\.(jpe?g|png|webp)/)?.[1]?.replace("jpeg", "jpg"),
    });
  }

  return {
    closing_at: closing,
    description_snippet: text.slice(0, DESCRIPTION_SNIPPET_MAX) || undefined,
    documents,
  };
}

export async function fetchGuinea(): Promise<IngestNotice[]> {
  const out: IngestNotice[] = [];
  const seen = new Set<string>();
  const cutoff = Date.now() - windowDays() * 86_400_000;
  let stop = false;

  for (let page = 1; page <= MAX_PAGES && !stop; page++) {
    const url = page === 1 ? CATEGORY : `${CATEGORY}page/${page}/`;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch {
      break; // last page reached / transient error — keep what we have
    }
    const $ = cheerio.load(html);
    const links = $("h3.elementor-post__title a");
    if (links.length === 0) break;

    links.each((_, el) => {
      const href = $(el).attr("href");
      const title = $(el).text().replace(/\s+/g, " ").trim();
      if (!href || !title || title.length < 10) return;

      // URL: https://www.jaoguinee.com/DD/MM/YYYY/slug/ID/
      const m = href.match(/jaoguinee\.com\/(\d{2})\/(\d{2})\/(\d{4})\/[^/]+\/(\d+)\/?$/);
      if (!m) return;
      const [, dd, mm, yyyy, id] = m;
      const published = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      if (Number.isNaN(published.getTime())) return;
      if (published.getTime() < cutoff) {
        stop = true; // listing is newest-first; everything below is older
        return;
      }
      if (published.getTime() > Date.now() + 2 * 86_400_000) return; // future-dated
      if (!id || seen.has(id)) return;
      seen.add(id);

      out.push({
        source_slug: "gn-jao",
        source_notice_id: id,
        source_url: href,
        title: title.slice(0, 400),
        language: "fr",
        country: "GN",
        notice_type: extractTypeRaw(title),
        published_at: published.toISOString(),
        // YELLOW license: metadata only — full body text never stored.
      });
    });
  }

  // Contract: requiresDetailFetch — enrich every notice from its detail page
  // (closing date, attachments, ≤300-char snippet). Detail wins over list.
  for (const n of out) {
    try {
      const d = await fetchDetail(n.source_url);
      if (d.closing_at) n.closing_at = d.closing_at;
      if (d.description_snippet) n.description = d.description_snippet;
      if (d.documents.length) n.documents = d.documents;
    } catch {
      // Detail page down → the list-level notice still flows (fields stay null).
    }
  }

  return out;
}
