import { describe, expect, it } from "vitest";
import { buildWatchlistIcs, icsToken, verifyIcsToken } from "../ics";

const tender = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Supply of solar; street, lights",
  slug: "supply-solar-abc123",
  closingAt: new Date("2026-08-20T15:00:00Z"),
  buyerName: "Ministry of Energy",
  country: "KE",
};

describe("buildWatchlistIcs", () => {
  const now = new Date("2026-07-10T00:00:00Z");
  const ics = buildWatchlistIcs([tender], "https://tenderlist.app", now);

  it("produces a valid VCALENDAR envelope with CRLF endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes special characters in SUMMARY", () => {
    expect(ics).toContain("SUMMARY:Tender closes: Supply of solar\\; street\\, lights");
  });

  it("contains the closing date and both reminders", () => {
    expect(ics).toContain("DTSTART:20260820T150000Z");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics).toContain("TRIGGER:-P1D");
  });

  it("uses a stable UID per tender", () => {
    expect(ics).toContain(`UID:tender-${tender.id}@tenderlist`);
  });
});

describe("ics tokens", () => {
  it("verifies its own tokens and rejects tampering", () => {
    const token = icsToken("user-1", "secret");
    expect(verifyIcsToken("user-1", token, "secret")).toBe(true);
    expect(verifyIcsToken("user-2", token, "secret")).toBe(false);
    expect(verifyIcsToken("user-1", token, "other-secret")).toBe(false);
    expect(verifyIcsToken("user-1", "short", "secret")).toBe(false);
  });
});
