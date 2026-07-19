import type { IngestNotice } from "@repo/config/ingest";

/**
 * TED (Tenders Electronic Daily) — official EU procurement API.
 * Docs: https://api.ted.europa.eu/  (v3 expert search)
 * No key required. Returns "normalized-ish" notices for /api/ingest.
 */
const TED_API = "https://api.ted.europa.eu/v3/notices/search";

// CPV division (first 2 digits) → our sector slug.
const CPV_SECTOR: Record<string, string> = {
  "45": "construction",
  "71": "construction",
  "09": "energy",
  "31": "energy",
  "33": "health",
  "85": "health",
  "48": "ict",
  "72": "ict",
  "03": "agriculture",
  "15": "agriculture",
  "34": "transport",
  "60": "transport",
  "90": "water",
  "80": "education",
  "79": "consulting",
  "50": "goods",
  "35": "security",
  "66": "finance",
};

// ISO 3166 alpha-3 → alpha-2 (countries TED commonly returns).
const ISO3_ISO2: Record<string, string> = {
  AUT: "AT", BEL: "BE", BGR: "BG", HRV: "HR", CYP: "CY", CZE: "CZ", DNK: "DK",
  EST: "EE", FIN: "FI", FRA: "FR", DEU: "DE", GRC: "GR", HUN: "HU", IRL: "IE",
  ITA: "IT", LVA: "LV", LTU: "LT", LUX: "LU", MLT: "MT", NLD: "NL", POL: "PL",
  PRT: "PT", ROU: "RO", SVK: "SK", SVN: "SI", ESP: "ES", SWE: "SE", NOR: "NO",
  CHE: "CH", GBR: "GB", ISL: "IS", TUR: "TR", UKR: "UA", SRB: "RS",
};

// English country name → ISO2 (TED titles start with "Country – Category – …").
const NAME_ISO2: Record<string, string> = {
  austria: "AT", belgium: "BE", bulgaria: "BG", croatia: "HR", cyprus: "CY",
  czechia: "CZ", "czech republic": "CZ", denmark: "DK", estonia: "EE",
  finland: "FI", france: "FR", germany: "DE", greece: "GR", hungary: "HU",
  ireland: "IE", italy: "IT", latvia: "LV", lithuania: "LT", luxembourg: "LU",
  malta: "MT", netherlands: "NL", poland: "PL", portugal: "PT", romania: "RO",
  slovakia: "SK", slovenia: "SI", spain: "ES", sweden: "SE", norway: "NO",
  switzerland: "CH", "united kingdom": "GB", iceland: "IS", turkey: "TR",
  türkiye: "TR", ukraine: "UA", serbia: "RS", "north macedonia": "MK",
  albania: "AL", montenegro: "ME", "bosnia and herzegovina": "BA",
};

function countryFromTitle(title: string): string | undefined {
  const first = title.split("–")[0]?.trim().toLowerCase();
  return first ? NAME_ISO2[first] : undefined;
}

const CPV_QUERIES = [
  "45000000", // construction
  "33000000", // health / medical
  "72000000", // ICT
  "34000000", // transport
  "09000000", // energy
];

interface TedNotice {
  "publication-number"?: string;
  "notice-title"?: Record<string, string>;
  "buyer-name"?: Record<string, string[]>;
  "deadline-receipt-request"?: string[];
  "publication-date"?: string;
  "place-of-performance"?: string[];
  "classification-cpv"?: string[];
  "notice-type"?: string;
  links?: { pdf?: Record<string, string>; xml?: Record<string, string> };
  // Structured fields (audited fill rates in comments):
  "procedure-type"?: string; // 93% — open/restricted/negotiated
  "contract-nature-main-proc"?: string; // 100% — works/supplies/services
  "total-value"?: number | string; // 58% — contract total value
  "total-value-cur"?: string | string[]; // 60% — its currency
  "estimated-value-lot"?: (number | string)[]; // 33% — per-lot value
  "estimated-value-cur-lot"?: string[];
  "title-lot"?: Record<string, string[]>; // 100% — lot titles (per language)
  "award-criterion-name-lot"?: Record<string, string[]>; // 68% — award criteria
  "award-criterion-number-weight-lot"?: (number | string)[]; // 65% — their weights
  "contract-duration-period-lot"?: { unit?: string; value?: string }[]; // 43% — duration
}

const NUM = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
};
const FIRST = (v: unknown): string | undefined =>
  Array.isArray(v) ? (v[0] as string | undefined) : (v as string | undefined);

/** Build the per-lot breakdown from TED's parallel lot arrays. */
function tedLots(n: TedNotice) {
  const titles = n["title-lot"] ? (n["title-lot"].eng ?? Object.values(n["title-lot"])[0] ?? []) : [];
  const values = n["estimated-value-lot"] ?? [];
  const currs = n["estimated-value-cur-lot"] ?? [];
  const critNames = n["award-criterion-name-lot"]
    ? (n["award-criterion-name-lot"].eng ?? Object.values(n["award-criterion-name-lot"])[0] ?? [])
    : [];
  const critWeights = n["award-criterion-number-weight-lot"] ?? [];
  const durations = n["contract-duration-period-lot"] ?? [];
  const count = Math.max(titles.length, values.length, durations.length);
  if (count === 0) return undefined;

  const lots = [];
  for (let i = 0; i < count; i++) {
    const criteria = critNames.map((name, j) => ({ name, weight: NUM(critWeights[j]) }));
    const dur = durations[i];
    lots.push({
      title: titles[i],
      estimated_value: NUM(values[i]),
      currency: currs[i],
      award_criteria: i === 0 && criteria.length ? criteria : undefined,
      duration: dur?.value ? `${dur.value} ${dur.unit ?? ""}`.trim() : undefined,
    });
  }
  return lots.length ? lots : undefined;
}

/** The official notice PDF (prefer English) — TED's real content lives there. */
function tedDocuments(links: TedNotice["links"], num: string) {
  const pdf = links?.pdf;
  if (!pdf) return undefined;
  const url = pdf.ENG ?? pdf.eng ?? Object.values(pdf)[0];
  if (!url) return undefined;
  return [{ title: `TED notice ${num} (PDF)`, url, file_type: "pdf" }];
}

function pickLang(obj: Record<string, string | string[]> | undefined): string | undefined {
  if (!obj) return undefined;
  const val = obj.eng ?? Object.values(obj)[0];
  return Array.isArray(val) ? val[0] : val;
}

/** TED dates come as "2026-07-10+02:00" (date only) or full ISO. Parse safely. */
function safeIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.includes("T") ? value : value.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function sectorFromCpv(cpvs: string[] | undefined): string | undefined {
  for (const cpv of cpvs ?? []) {
    const sector = CPV_SECTOR[cpv.slice(0, 2)];
    if (sector) return sector;
  }
  return undefined;
}

async function fetchPage(cpv: string, sinceIso: string): Promise<TedNotice[]> {
  const res = await fetch(TED_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `PD>=${sinceIso} AND classification-cpv IN (${cpv})`,
      limit: 20,
      fields: [
        "publication-number",
        "notice-title",
        "buyer-name",
        "deadline-receipt-request",
        "publication-date",
        "place-of-performance",
        "classification-cpv",
        "notice-type",
        "links",
        "procedure-type",
        "contract-nature-main-proc",
        "total-value",
        "total-value-cur",
        "estimated-value-lot",
        "estimated-value-cur-lot",
        "title-lot",
        "award-criterion-name-lot",
        "award-criterion-number-weight-lot",
        "contract-duration-period-lot",
      ],
    }),
  });
  if (!res.ok) throw new Error(`TED ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { notices?: TedNotice[] };
  return json.notices ?? [];
}

export async function fetchTed(): Promise<IngestNotice[]> {
  // Only notices published in the last 7 days (YYYYMMDD as TED expects)...
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const since = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const now = Date.now();

  const out: IngestNotice[] = [];
  const seen = new Set<string>();

  for (const cpv of CPV_QUERIES) {
    let raw: TedNotice[] = [];
    try {
      raw = await fetchPage(cpv, since);
    } catch {
      continue; // one CPV failing shouldn't sink the run
    }
    for (const n of raw) {
      const num = n["publication-number"];
      const title = pickLang(n["notice-title"]);
      if (!num || !title || title.length < 3 || seen.has(num)) continue;
      seen.add(num);

      // ...and still open: a real deadline that hasn't passed.
      const deadline = n["deadline-receipt-request"]?.[0];
      if (!deadline) continue;
      const closingMs = new Date(deadline).getTime();
      if (Number.isNaN(closingMs) || closingMs <= now) continue;

      const iso3 = n["place-of-performance"]?.[0];
      const country = (iso3 ? ISO3_ISO2[iso3] : undefined) ?? countryFromTitle(title);
      const cpvCodes = Array.from(new Set(n["classification-cpv"] ?? [])).slice(0, 8);

      out.push({
        source_slug: "ted-eu",
        source_notice_id: num,
        source_url: `https://ted.europa.eu/en/notice/-/detail/${num}`,
        title: title.slice(0, 400),
        language: "en",
        country,
        buyer_name: pickLang(n["buyer-name"]),
        sector: sectorFromCpv(n["classification-cpv"]),
        cpv_codes: cpvCodes,
        notice_type: n["notice-type"] ?? undefined,
        procurement_method: n["procedure-type"] ?? undefined,
        contract_type: n["contract-nature-main-proc"] ?? undefined,
        estimated_value_max: NUM(n["total-value"]),
        currency: FIRST(n["total-value-cur"]),
        published_at: safeIso(n["publication-date"]),
        closing_at: safeIso(deadline),
        documents: tedDocuments(n.links, num),
        lots: tedLots(n),
      });
    }
  }

  return out;
}
