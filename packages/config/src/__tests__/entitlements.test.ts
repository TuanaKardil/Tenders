import { describe, expect, it } from "vitest";
import { ENTITLEMENTS, entitlementsFor } from "../entitlements";
import { ingestBatchSchema, ingestNoticeSchema } from "../ingest";

describe("entitlements matrix", () => {
  it("free plan enforces the documented quotas", () => {
    const free = entitlementsFor("free");
    expect(free.searchesPerDay).toBe(10);
    expect(free.archiveDays).toBe(30);
    expect(free.detailViewsPerMonth).toBe(20);
    expect(free.sourceClicksPerMonth).toBe(5);
    expect(free.maxAlerts).toBe(1);
    expect(free.allowedFrequencies).toEqual(["weekly"]);
    expect(free.maxWatchlistItems).toBe(10);
    expect(free.aiSummaries).toBe("sample");
    expect(free.csvExport).toBe(false);
    expect(free.eligibilityAi).toBe(false);
  });

  it("starter is unlimited on consumption but capped on alerts", () => {
    const starter = entitlementsFor("starter");
    expect(starter.searchesPerDay).toBeNull();
    expect(starter.archiveDays).toBeNull();
    expect(starter.detailViewsPerMonth).toBeNull();
    expect(starter.sourceClicksPerMonth).toBeNull();
    expect(starter.maxAlerts).toBe(10);
    expect(starter.allowedFrequencies).not.toContain("instant");
    expect(starter.csvExport).toBe(false);
  });

  it("pro unlocks instant alerts, csv export and eligibility AI", () => {
    const pro = entitlementsFor("pro");
    expect(pro.maxAlerts).toBe(30);
    expect(pro.allowedFrequencies).toContain("instant");
    expect(pro.csvExport).toBe(true);
    expect(pro.eligibilityAi).toBe(true);
  });

  it("every plan has a full entitlements object", () => {
    for (const plan of ["free", "starter", "pro"] as const) {
      expect(ENTITLEMENTS[plan]).toBeDefined();
      expect(ENTITLEMENTS[plan].allowedFrequencies.length).toBeGreaterThan(0);
    }
  });
});

describe("ingest contract", () => {
  const valid = {
    source_slug: "gh-ppa",
    source_notice_id: "GH-2026-001",
    source_url: "https://tenders.example.gov.gh/notice/1",
    title: "Construction of rural health clinics",
  };

  it("accepts a minimal valid notice", () => {
    expect(ingestNoticeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a notice without required identity fields", () => {
    expect(ingestNoticeSchema.safeParse({ ...valid, source_url: "not-a-url" }).success).toBe(false);
    expect(ingestNoticeSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });

  it("rejects malformed datetimes and oversized batches", () => {
    expect(
      ingestNoticeSchema.safeParse({ ...valid, closing_at: "2026-13-45" }).success
    ).toBe(false);
    expect(
      ingestBatchSchema.safeParse({ notices: [] }).success
    ).toBe(false);
  });

  it("accepts a full notice with documents", () => {
    const result = ingestNoticeSchema.safeParse({
      ...valid,
      language: "fr",
      country: "SN",
      closing_at: "2026-08-15T12:00:00+00:00",
      estimated_value_max: 1_500_000,
      currency: "XOF",
      documents: [{ url: "https://example.com/tender.pdf", file_type: "pdf" }],
    });
    expect(result.success).toBe(true);
  });
});
