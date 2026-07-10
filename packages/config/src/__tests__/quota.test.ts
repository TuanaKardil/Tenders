import { describe, it, expect } from "vitest";
import { entitlementsFor } from "../entitlements";
import { periodStamp, quotaKey, quotaLimit, QUOTA_SPECS } from "../quota";

const at = (iso: string) => new Date(iso);

describe("periodStamp", () => {
  it("formats daily stamps in UTC", () => {
    expect(periodStamp("day", at("2026-07-10T23:30:00Z"))).toBe("2026-07-10");
  });
  it("formats monthly stamps in UTC", () => {
    expect(periodStamp("month", at("2026-07-10T23:30:00Z"))).toBe("2026-07");
  });
  it("zero-pads month and day", () => {
    expect(periodStamp("day", at("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("quotaKey", () => {
  it("uses a daily period for search", () => {
    expect(quotaKey("search", "u1", at("2026-07-10T10:00:00Z"))).toBe("q:search:u1:2026-07-10");
  });
  it("uses a monthly period for click and detail", () => {
    expect(quotaKey("click", "u1", at("2026-07-10T10:00:00Z"))).toBe("q:click:u1:2026-07");
    expect(quotaKey("detail", "u1", at("2026-07-10T10:00:00Z"))).toBe("q:detail:u1:2026-07");
  });
});

describe("quotaLimit", () => {
  it("returns free-plan ceilings", () => {
    const free = entitlementsFor("free");
    expect(quotaLimit("search", free)).toBe(10);
    expect(quotaLimit("detail", free)).toBe(20);
    expect(quotaLimit("click", free)).toBe(5);
  });
  it("returns null (unlimited) for starter and pro", () => {
    for (const plan of ["starter", "pro"] as const) {
      const ent = entitlementsFor(plan);
      expect(quotaLimit("search", ent)).toBeNull();
      expect(quotaLimit("detail", ent)).toBeNull();
      expect(quotaLimit("click", ent)).toBeNull();
    }
  });
});

describe("QUOTA_SPECS", () => {
  it("maps each kind to the right entitlements field and period", () => {
    expect(QUOTA_SPECS.search).toMatchObject({ limitField: "searchesPerDay", period: "day" });
    expect(QUOTA_SPECS.detail).toMatchObject({ limitField: "detailViewsPerMonth", period: "month" });
    expect(QUOTA_SPECS.click).toMatchObject({ limitField: "sourceClicksPerMonth", period: "month" });
  });
});
