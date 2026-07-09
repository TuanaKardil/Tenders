import { describe, expect, it } from "vitest";
import type { IngestNotice } from "@repo/config/ingest";
import {
  computeSourceHash,
  extractionConfidence,
  qualityScore,
  slugify,
  statusFromClosingAt,
  tenderSlug,
  toDate,
} from "../normalize";

const base: IngestNotice = {
  source_slug: "ke-ppra",
  source_notice_id: "KE-100",
  source_url: "https://tenders.go.ke/notice/100",
  title: "Supply of solar street lighting — Nakuru County",
};

describe("computeSourceHash", () => {
  it("is stable for identical content", () => {
    expect(computeSourceHash(base)).toBe(computeSourceHash({ ...base }));
  });

  it("changes when a meaningful field changes", () => {
    expect(computeSourceHash(base)).not.toBe(
      computeSourceHash({ ...base, closing_at: "2026-09-01T00:00:00Z" })
    );
  });

  it("ignores non-meaningful fields like sector", () => {
    expect(computeSourceHash(base)).toBe(
      computeSourceHash({ ...base, sector: "energy" })
    );
  });
});

describe("slug generation", () => {
  it("slugifies with diacritics and punctuation stripped", () => {
    expect(slugify("Construction de l'École — Sénégal")).toBe(
      "construction-de-l-ecole-senegal"
    );
  });

  it("appends a random suffix and never exceeds a sane length", () => {
    const slug = tenderSlug("A".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(87);
    expect(slug).toMatch(/-[a-z0-9]{6}$/);
  });

  it("handles titles that slugify to nothing", () => {
    expect(tenderSlug("!!!")).toMatch(/^tender-[a-z0-9]{6}$/);
  });
});

describe("statusFromClosingAt", () => {
  const now = new Date("2026-07-01T00:00:00Z");

  it("is open when closing far in the future", () => {
    expect(statusFromClosingAt(new Date("2026-08-01T00:00:00Z"), now)).toBe("open");
  });

  it("is closing_soon within 7 days", () => {
    expect(statusFromClosingAt(new Date("2026-07-05T00:00:00Z"), now)).toBe(
      "closing_soon"
    );
  });

  it("is closed after the deadline", () => {
    expect(statusFromClosingAt(new Date("2026-06-30T00:00:00Z"), now)).toBe("closed");
  });

  it("defaults to open with no deadline", () => {
    expect(statusFromClosingAt(null, now)).toBe("open");
  });
});

describe("confidence and quality", () => {
  it("minimal notice stays below the 0.7 auto-publish bar", () => {
    expect(extractionConfidence(base)).toBeLessThan(0.7);
  });

  it("a complete notice clears the auto-publish bar", () => {
    const full: IngestNotice = {
      ...base,
      closing_at: "2026-08-15T12:00:00Z",
      country: "KE",
      buyer_name: "Nakuru County Government",
      sector: "energy",
      description: "Supply and installation of 500 solar street lights.",
    };
    expect(extractionConfidence(full)).toBeGreaterThanOrEqual(0.7);
    expect(qualityScore(full)).toBeGreaterThan(qualityScore(base));
  });
});

describe("toDate", () => {
  it("parses ISO strings and rejects garbage", () => {
    expect(toDate("2026-08-15T12:00:00Z")?.toISOString()).toBe(
      "2026-08-15T12:00:00.000Z"
    );
    expect(toDate("not-a-date")).toBeNull();
    expect(toDate(undefined)).toBeNull();
  });
});
