import { COUNTRIES } from "@repo/config/constants";
import { SAME_DOMAIN_DELAY_MS } from "@repo/config/source-contract";

// English country name → ISO2, built from our constants + a few aliases.
const NAME_TO_ISO2: Record<string, string> = {
  ...Object.fromEntries(COUNTRIES.map((c) => [c.en.toLowerCase(), c.code])),
  "czech republic": "CZ",
  "united republic of tanzania": "TZ",
  "democratic republic of the congo": "CD",
  "republic of the congo": "CG",
  "cote d'ivoire": "CI",
  "united states": "US",
  "united states of america": "US",
  "russian federation": "RU",
  "viet nam": "VN",
  "syrian arab republic": "SY",
  "iran (islamic republic of)": "IR",
  "republic of korea": "KR",
  "moldova, republic of": "MD",
  "lao people's democratic republic": "LA",
};

export function nameToIso2(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return NAME_TO_ISO2[name.trim().toLowerCase()];
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parses "DD-Mon-YYYY" (e.g. "30-Jul-2026") to an ISO string, or undefined. */
export function parseDmy(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = value.match(/(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})/);
  if (!m || !m[1] || !m[2] || !m[3]) return undefined;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return undefined;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Parses "2026-07-20 10:00:00" (space-separated, treated as UTC), or undefined. */
export function parseSpaceDateTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value.trim().replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Parses an ISO-ish date ("2026-07-17") safely, or undefined. */
export function parseIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value.trim().slice(0, 10));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Parses any full ISO datetime ("2026-07-20T19:30:00+03:00") safely. */
export function parseFullIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Founder's rule: only keep notices that are still OPEN and were published in
 * the last `days` days. Missing publish date → keep (some portals omit it) as
 * long as the deadline is in the future.
 */
export function isRecentAndOpen(
  publishedIso: string | undefined,
  closingIso: string | undefined,
  days = 7
): boolean {
  if (!closingIso) return false;
  const now = Date.now();
  // Date-only deadlines (parsed to midnight) stay open through end of that day.
  const grace = closingIso.endsWith("T00:00:00.000Z") ? 86_400_000 - 1000 : 0;
  const closing = new Date(closingIso).getTime() + grace;
  if (Number.isNaN(closing) || closing <= now) return false;
  if (publishedIso) {
    const pub = new Date(publishedIso).getTime();
    if (!Number.isNaN(pub)) {
      // Too old, or published in the future (some portals pre-date notices).
      if (pub < now - days * 86_400_000) return false;
      if (pub > now + 2 * 86_400_000) return false;
    }
  }
  return true;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export async function fetchHtml(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Polite fetching (source-contract standard for detail-page crawls):
// ≥500ms between requests to the same domain, backoff+retry on 429/503.

const lastHitByDomain = new Map<string, number>();

async function throttleDomain(url: string): Promise<void> {
  const domain = new URL(url).hostname;
  const last = lastHitByDomain.get(domain) ?? 0;
  const wait = last + SAME_DOMAIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHitByDomain.set(domain, Date.now());
}

/** fetchHtml with same-domain rate limiting and 429/503 backoff (2 retries). */
export async function politeFetchHtml(url: string, init?: RequestInit): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    await throttleDomain(url);
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": UA, ...(init?.headers ?? {}) },
    });
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.text();
  }
}
