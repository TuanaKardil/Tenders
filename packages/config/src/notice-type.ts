/**
 * Notice-type normalization — the ONE place that maps every source's raw
 * notice_type text onto our canonical enum. No AI: pure string dictionaries.
 *
 * Scrapers keep writing the raw source text (preserved in `notice_type_raw`);
 * `normalizeNoticeType(raw, sourceSlug)` turns it into the enum stored in
 * `notice_type`. Anything we can't map returns "unknown" (never guessed, never
 * left blank) so the classification gate can send it to its AI tier.
 *
 * To add a source or a new raw value: extend the dictionary here — do NOT
 * scatter mapping logic into the scrapers.
 */

import { type NoticeType } from "./constants";

/** Collapse whitespace + lowercase so dictionary keys are stable. */
function norm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Per-source exact-match dictionaries. Keys are normalized (lowercase, single
 * spaces). Values seen in real data are marked; the rest are plausible values
 * from each portal's documented method list, mapped ahead of time.
 */
const BY_SOURCE: Record<string, Record<string, NoticeType>> = {
  // Ethiopia eGP — lot.method
  "et-egp": {
    open: "tender", // seen
    "open tender": "tender",
    restricted: "tender",
    "national competitive bidding": "tender",
    "international competitive bidding": "tender",
    "two stage": "tender",
    "two stage bidding": "tender",
    framework: "tender",
    "direct procurement": "tender",
    direct: "tender",
    "request for quotation": "rfq",
    "request for quotations": "rfq",
    "request for proposal": "rfp",
    "request for proposals": "rfp",
    "expression of interest": "eoi",
    prequalification: "prequalification",
    "pre-qualification": "prequalification",
  },

  // Kenya PPIP — procurement_method.title
  "ke-ppip": {
    "open tender": "tender", // seen
    "framework agreements": "tender", // seen
    "framework agreement": "tender",
    "restricted tendering": "tender", // seen
    "restricted tender": "tender",
    prequalification: "prequalification", // seen
    "two stage tendering": "tender",
    "design competition": "tender",
    "low value procurement": "tender",
    "specially permitted procurement": "tender",
    "direct procurement": "tender",
    "request for proposal": "rfp",
    "request for proposals": "rfp",
    "request for quotation": "rfq",
    "request for quotations": "rfq",
    "expression of interest": "eoi",
  },

  // TED (EU) — eForms notice-type codes. Match by exact code; prefixes handled below.
  "ted-eu": {
    "cn-standard": "tender", // seen (contract notice)
    "cn-social": "tender",
    "cn-desg": "tender",
    "can-standard": "award", // contract award notice
    "can-social": "award",
    "can-desg": "award",
    "can-modif": "award",
    "can-tender": "award",
    veat: "award", // voluntary ex-ante transparency notice
    "qu-sy": "prequalification", // qualification system
    "pin-only": "tender", // prior information notice used as a call
    "pin-buyer": "tender",
    "pin-cfc-standard": "tender",
    "pin-cfc-social": "tender",
    brin: "unknown", // buyer profile / registration
    corr: "unknown", // corrigendum
  },

  // Uganda eGP — bid-notice table "type" cell
  "ug-egp": {
    "open domestic": "tender", // seen
    "open international": "tender",
    open: "tender",
    "restricted domestic": "tender",
    "restricted international": "tender",
    restricted: "tender",
    "direct procurement": "tender", // seen
    "micro procurement": "tender",
    "design contest": "tender",
    "request for quotations/proposals": "rfq", // seen
    "request for quotations": "rfq",
    "request for proposals": "rfp",
    "quotations/proposals": "rfq",
    "expression of interest": "eoi",
    "pre-qualification": "prequalification",
    prequalification: "prequalification",
    "award notice": "award",
    "best evaluated bidder notice": "award",
    "best evaluated bidder": "award",
    "cancellation notice": "cancellation",
    cancelled: "cancellation",
    disposal: "disposal",
  },

  // UNGM — notice type label (scraper currently emits none → null → unknown)
  ungm: {
    "request for proposal": "rfp",
    "request for proposal (rfp)": "rfp",
    "request for quotation": "rfq",
    "request for quotation (rfq)": "rfq",
    "invitation to bid": "tender",
    "invitation to bid (itb)": "tender",
    "expression of interest": "eoi",
    "expression of interest (eoi)": "eoi",
    "request for information": "unknown",
    "request for information (rfi)": "unknown",
    "notice of award": "award",
    "contract award": "award",
  },
};

/** TED codes are namespaced; fall back to prefix when the exact code is new. */
function tedByPrefix(code: string): NoticeType | null {
  if (code.startsWith("can-") || code.startsWith("veat")) return "award";
  if (code.startsWith("qu-")) return "prequalification";
  if (code.startsWith("cn-") || code.startsWith("pin-")) return "tender";
  return null;
}

/**
 * Generic keyword fallback — source-agnostic, applied only when the per-source
 * dictionary misses. Ordered: the most specific / disqualifying signals first.
 */
function byKeyword(s: string): NoticeType {
  if (/\baward\b|best evaluated bidder|notification of award/.test(s)) return "award";
  if (/\bcancel/.test(s) || /\btermination\b/.test(s)) return "cancellation";
  if (/\bdisposal\b|\bauction\b/.test(s)) return "disposal";
  if (/\bvacancy\b|\brecruitment\b|\binternship\b/.test(s)) return "vacancy";
  if (/pre-?qualification/.test(s)) return "prequalification";
  if (/expression of interest|\beoi\b/.test(s)) return "eoi";
  if (/request for proposal|\brfp\b/.test(s)) return "rfp";
  if (/request for quotation|\brfq\b/.test(s)) return "rfq";
  if (/\btender\b|invitation to bid|\bitb\b|\bopen\b|restricted|framework|direct procurement/.test(s))
    return "tender";
  return "unknown";
}

/**
 * Map a raw source notice_type onto the canonical enum.
 * @param raw  Original source text (may be null/empty).
 * @param sourceSlug  e.g. "ke-ppip", "ted-eu" — selects the dictionary.
 */
export function normalizeNoticeType(
  raw: string | null | undefined,
  sourceSlug: string
): NoticeType {
  if (!raw || !raw.trim()) return "unknown";
  const key = norm(raw);

  const dict = BY_SOURCE[sourceSlug];
  if (dict && dict[key]) return dict[key];

  if (sourceSlug === "ted-eu") {
    const byPrefix = tedByPrefix(key);
    if (byPrefix) return byPrefix;
  }

  return byKeyword(key);
}
