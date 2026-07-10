import { describe, expect, it } from "vitest";
import { buildMeiliFilter, parseSearchParams } from "../search";

describe("buildMeiliFilter", () => {
  it("returns undefined for empty filters", () => {
    expect(buildMeiliFilter({})).toBeUndefined();
  });

  it("builds IN clauses for list filters", () => {
    expect(buildMeiliFilter({ countries: ["KE", "GH"], sectors: ["energy"] })).toBe(
      'country IN ["KE", "GH"] AND sector_primary IN ["energy"]'
    );
  });

  it("builds numeric range and date clauses", () => {
    const filter = buildMeiliFilter({
      valueMin: 10_000,
      valueMax: 500_000,
      closingBefore: "2026-08-01T00:00:00Z",
    });
    expect(filter).toContain("value_usd_est >= 10000");
    expect(filter).toContain("value_usd_est <= 500000");
    expect(filter).toContain(`closing_at <= ${Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000)}`);
  });

  it("applies archive depth relative to now", () => {
    const now = new Date("2026-07-10T00:00:00Z");
    const filter = buildMeiliFilter({ publishedWithinDays: 30 }, now);
    const cutoff = Math.floor(now.getTime() / 1000) - 30 * 86_400;
    expect(filter).toBe(`published_at >= ${cutoff}`);
  });

  it("escapes quotes in values", () => {
    expect(buildMeiliFilter({ sources: ['a"b'] })).toBe('source_slug IN ["a\\"b"]');
  });

  it("ignores invalid closingBefore", () => {
    expect(buildMeiliFilter({ closingBefore: "garbage" })).toBeUndefined();
  });
});

describe("parseSearchParams", () => {
  it("parses comma lists, repeated params and numbers", () => {
    expect(
      parseSearchParams({
        q: " solar ",
        country: "KE,GH",
        sector: ["energy", "water"],
        value_min: "1000",
        value_max: "abc",
      })
    ).toEqual({
      q: "solar",
      countries: ["KE", "GH"],
      sectors: ["energy", "water"],
      status: undefined,
      sources: undefined,
      valueMin: 1000,
      valueMax: undefined,
      closingBefore: undefined,
    });
  });

  it("drops empty values", () => {
    const parsed = parseSearchParams({ q: "  ", country: "" });
    expect(parsed.q).toBeUndefined();
    expect(parsed.countries).toBeUndefined();
  });
});
