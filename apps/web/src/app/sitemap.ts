import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db, tenders } from "@repo/db";
import { COUNTRY_CODES, SECTOR_SLUGS } from "@repo/config/constants";
import { absoluteUrl, SEO_LIVE } from "@/lib/seo";

export const revalidate = 3600;

function withAlternates(path: string) {
  return {
    en: absoluteUrl(path),
    tr: absoluteUrl(path === "/" ? "/tr" : `/tr${path}`),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/pricing", priority: 0.7 },
    { path: "/map", priority: 0.6 },
    { path: "/terms", priority: 0.3 },
    { path: "/privacy", priority: 0.3 },
    { path: "/takedown", priority: 0.3 },
  ];

  const entries: MetadataRoute.Sitemap = staticPaths.map(({ path, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency: "daily",
    priority,
    alternates: { languages: withAlternates(path) },
  }));

  // Programmatic SEO landings only enter the sitemap once real data is live.
  if (SEO_LIVE) {
    const landingPaths = [
      ...COUNTRY_CODES.map((c) => `/countries/${c.toLowerCase()}`),
      ...SECTOR_SLUGS.map((s) => `/sectors/${s}`),
    ];
    for (const path of landingPaths) {
      entries.push({
        url: absoluteUrl(path),
        changeFrequency: "daily",
        priority: 0.5,
        alternates: { languages: withAlternates(path) },
      });
    }
  }

  try {
    const rows = await db
      .select({ slug: tenders.slug, updated: tenders.lastSeenAt })
      .from(tenders)
      .where(eq(tenders.isPublished, true));
    for (const r of rows) {
      const path = `/tenders/${r.slug}`;
      entries.push({
        url: absoluteUrl(path),
        lastModified: r.updated ?? undefined,
        changeFrequency: "daily",
        priority: 0.6,
        alternates: { languages: withAlternates(path) },
      });
    }
  } catch {
    // DB unavailable — static entries still form a valid sitemap.
  }

  return entries;
}
