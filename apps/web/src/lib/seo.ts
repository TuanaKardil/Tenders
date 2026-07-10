export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const SITE_NAME = "Tenderlist";

/**
 * Whether programmatic SEO pages (countries/sectors) may be indexed.
 * Off by default so sample/seed data is never indexed — flip to "true" only
 * once real, sourced tender data is live.
 */
export const SEO_LIVE = process.env.NEXT_PUBLIC_SEO_LIVE === "true";

/** Absolute URL for a locale-less path (e.g. "/tenders/foo"). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === "/" ? "" : path}` || SITE_URL;
}

/** The Turkish (prefixed) variant of a default-locale path. */
function trUrl(path: string): string {
  return absoluteUrl(path === "/" ? "/tr" : `/tr${path}`);
}

/**
 * Canonical + hreflang alternates for a page. `path` is the default-locale
 * (English, unprefixed) path; `locale` is the page's current locale.
 */
export function alternatesFor(path: string, locale: string) {
  const en = absoluteUrl(path);
  const tr = trUrl(path);
  return {
    canonical: locale === "tr" ? tr : en,
    languages: { en, tr, "x-default": en },
  };
}

// --- schema.org JSON-LD builders (never JobPosting on tenders) ---

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function faqLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}
