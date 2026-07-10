import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Utility routes are non-indexable; app pages (search/dashboard/…) emit their
    // own noindex meta, which is more reliable than path-based disallow with i18n.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/go/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
