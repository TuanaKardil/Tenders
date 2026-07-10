import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db, tenders } from "@repo/db";
import { absoluteUrl } from "@/lib/seo";

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
  ];

  const entries: MetadataRoute.Sitemap = staticPaths.map(({ path, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency: "daily",
    priority,
    alternates: { languages: withAlternates(path) },
  }));

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
