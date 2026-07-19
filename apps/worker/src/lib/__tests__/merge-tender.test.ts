import { describe, expect, it } from "vitest";
import { mergeExtractedFields, joinDocTexts, sourceProvenance } from "../merge-tender";
import type { ExtractedFields } from "../ai";

const NOW = new Date("2026-07-19T12:00:00Z");

const AI_EMPTY: ExtractedFields = {
  estimated_value_min: null,
  estimated_value_max: null,
  currency: null,
  sector_primary: null,
  sectors_secondary: [],
  cpv_codes: [],
  eligibility_countries: [],
  eligibility_notes_en: null,
  closing_date: null,
  notice_type_ai: null,
  extraction_confidence: null,
};

const EMPTY_ROW = {
  closingAt: null,
  estimatedValueMax: null,
  currency: null,
  eligibilityNotesEn: null,
  fieldProvenance: {},
};

describe("mergeExtractedFields — fill priority", () => {
  it("fills empty critical fields from AI with document provenance", () => {
    const { update, provenance } = mergeExtractedFields(
      EMPTY_ROW,
      { ...AI_EMPTY, closing_date: "2026-08-05", currency: "GNF", estimated_value_max: 150000000 },
      true,
      NOW
    );
    expect((update.closingAt as Date).toISOString()).toContain("2026-08-05");
    expect(update.currency).toBe("GNF");
    expect(provenance.closing_at).toBe("document");
    expect(provenance.currency).toBe("document");
    expect(provenance.estimated_value).toBe("document");
  });

  it("uses ai_page_text provenance when no document text was in the input", () => {
    const { provenance } = mergeExtractedFields(
      EMPTY_ROW,
      { ...AI_EMPTY, currency: "USD" },
      false,
      NOW
    );
    expect(provenance.currency).toBe("ai_page_text");
  });

  it("SOURCE WINS: a source-provided value is never overridden by AI", () => {
    const existing = {
      ...EMPTY_ROW,
      closingAt: new Date("2026-07-21T00:00:00Z"),
      fieldProvenance: { closing_at: "source_page" },
    };
    const { update, provenance } = mergeExtractedFields(
      existing,
      { ...AI_EMPTY, closing_date: "2026-09-30" }, // AI disagrees
      true,
      NOW
    );
    expect(update.closingAt).toBeUndefined(); // page value stands
    expect(provenance.closing_at).toBe("source_page"); // origin preserved
  });

  it("NO DOWNGRADE: AI nulls never blank an existing value", () => {
    const existing = { ...EMPTY_ROW, currency: "KES", eligibilityNotesEn: "NCA 8+ required" };
    const { update } = mergeExtractedFields(existing, AI_EMPTY, true, NOW);
    expect(update.currency).toBeUndefined();
    expect(update.eligibilityNotesEn).toBeUndefined();
  });

  it("rejects absurd closing dates (year out of range)", () => {
    const { update } = mergeExtractedFields(
      EMPTY_ROW,
      { ...AI_EMPTY, closing_date: "1999-01-01" },
      true,
      NOW
    );
    expect(update.closingAt).toBeUndefined();
  });

  it("preserves existing provenance entries when adding new ones", () => {
    const existing = {
      ...EMPTY_ROW,
      fieldProvenance: { published_at: "source_page" },
    };
    const { provenance } = mergeExtractedFields(
      existing,
      { ...AI_EMPTY, currency: "EUR" },
      true,
      NOW
    );
    expect(provenance.published_at).toBe("source_page");
    expect(provenance.currency).toBe("document");
  });
});

describe("joinDocTexts — multi-document input", () => {
  it("includes EVERY document's text, in order, separated", () => {
    const joined = joinDocTexts(["doc one", null, "doc two", "", "doc three"], 10_000);
    expect(joined).toContain("doc one");
    expect(joined).toContain("doc two");
    expect(joined).toContain("doc three");
    expect(joined.split("\n\n---\n\n")).toHaveLength(3);
  });

  it("caps the combined length", () => {
    const joined = joinDocTexts(["a".repeat(500), "b".repeat(500)], 600);
    expect(joined.length).toBe(600);
  });
});

describe("sourceProvenance — scrape-time stamp", () => {
  it("stamps only the fields the source actually provided", () => {
    const p = sourceProvenance({ closing_at: "2026-08-01", buyer_name: "MCENI", notice_type: "Open" });
    expect(p).toEqual({ closing_at: "source_page", buyer: "source_page", notice_type: "source_page" });
  });
});
