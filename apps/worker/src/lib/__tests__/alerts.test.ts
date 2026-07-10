import { describe, expect, it } from "vitest";
import { queryToFilters, searchUrlFor } from "../alerts";

describe("queryToFilters", () => {
  it("maps saved-search query and bounds by lastRunAt", () => {
    const lastRun = new Date("2026-07-01T00:00:00Z");
    const filters = queryToFilters(
      { q: "solar", countries: ["KE"], sectors: ["energy"], status: ["open"] },
      lastRun
    );
    expect(filters.q).toBe("solar");
    expect(filters.countries).toEqual(["KE"]);
    expect(filters.publishedAfterUnix).toBe(Math.floor(lastRun.getTime() / 1000));
  });

  it("omits the cutoff for never-run searches", () => {
    expect(queryToFilters({}, null).publishedAfterUnix).toBeUndefined();
  });
});

describe("searchUrlFor", () => {
  it("builds the /search URL matching the app's param format", () => {
    expect(
      searchUrlFor(
        { q: "solar", countries: ["KE", "GH"], sectors: ["energy"] },
        "https://tenderlist.app"
      )
    ).toBe(
      "https://tenderlist.app/search?q=solar&country=KE%2CGH&sector=energy"
    );
  });

  it("handles empty queries", () => {
    expect(searchUrlFor({}, "https://x.app")).toBe("https://x.app/search");
  });
});
