import * as cheerio from "cheerio";
import type { IngestNotice } from "@repo/config/ingest";
import { fetchHtml } from "./shared";

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
        // YELLOW license: metadata only — no body text, no closing date on list.
      });
    });
  }

  return out;
}
