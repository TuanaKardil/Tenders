import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { db, tenders, sources, documents as documentsTable } from "@repo/db";
import { similarTenders } from "@/lib/meilisearch";
import { JsonLd } from "@/components/seo/json-ld";
import { alternatesFor, breadcrumbLd, absoluteUrl } from "@/lib/seo";
import { TenderCard } from "@/components/tenders/tender-card";
import { DeadlineChip } from "@/components/tenders/deadline-chip";
import { WatchlistButton } from "@/components/tenders/watchlist-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  countryFlag,
  countryName,
  formatDate,
  formatUsd,
  sectorName,
} from "@/lib/format";

// ISR: revalidate detail pages hourly.
export const revalidate = 3600;
export const dynamicParams = true;

interface TenderPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

async function getTender(slug: string) {
  const [row] = await db
    .select({ tender: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(tenders.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: TenderPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const row = await getTender(slug);
  if (!row || !row.tender.isPublished) return { title: "Tender not found" };
  const title =
    locale === "tr" && row.tender.titleTr ? row.tender.titleTr : (row.tender.titleEn ?? row.tender.titleOriginal);
  const summary = locale === "tr" ? row.tender.summaryTr : row.tender.summaryEn;
  return {
    title,
    description: summary?.slice(0, 160),
    alternates: alternatesFor(`/tenders/${slug}`, locale),
    openGraph: {
      type: "article",
      title,
      description: summary?.slice(0, 160) ?? undefined,
      url: absoluteUrl(`/tenders/${slug}`),
    },
  };
}

export default async function TenderPage({ params }: TenderPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tender");
  const loc = locale === "tr" ? "tr" : "en";

  const row = await getTender(slug);
  if (!row || !row.tender.isPublished) notFound();
  const { tender, source } = row;

  const docs = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.tenderId, tender.id));

  let similar: Awaited<ReturnType<typeof similarTenders>> = [];
  try {
    similar = await similarTenders({
      id: tender.id,
      country: tender.country,
      sector_primary: tender.sectorPrimary,
      title_en: tender.titleEn ?? tender.titleOriginal,
    });
  } catch {
    // search unavailable — detail page still renders
  }

  const title = loc === "tr" && tender.titleTr ? tender.titleTr : (tender.titleEn ?? tender.titleOriginal);
  const summary = loc === "tr" && tender.summaryTr ? tender.summaryTr : tender.summaryEn;
  const value = formatUsd(tender.valueUsdEst ? Number(tender.valueUsdEst) : null);

  const facts: { label: string; value: string | null }[] = [
    { label: t("buyer"), value: tender.buyerNameRaw },
    { label: t("funder"), value: tender.funderName },
    {
      label: t("location"),
      value: [tender.city, countryName(tender.country, loc)].filter(Boolean).join(", "),
    },
    { label: t("sector"), value: sectorName(tender.sectorPrimary, loc) || null },
    { label: t("noticeType"), value: tender.noticeType?.toUpperCase() ?? null },
    { label: t("method"), value: tender.procurementMethod },
    { label: t("published"), value: formatDate(tender.publishedAt, loc) },
    { label: t("closing"), value: formatDate(tender.closingAt, loc) },
    {
      label: t("estimatedValue"),
      value: value ? `${value}${tender.currency ? ` (${tender.currency})` : ""}` : null,
    },
  ];

  const timeline = [
    { label: t("published"), date: tender.publishedAt },
    { label: t("questionDeadline"), date: tender.questionDeadline },
    { label: t("closing"), date: tender.closingAt },
  ].filter((item) => item.date);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <JsonLd
        data={breadcrumbLd([
          { name: "Tenderlist", url: absoluteUrl("/") },
          { name: loc === "tr" ? "Ara" : "Search", url: absoluteUrl("/search") },
          { name: title, url: absoluteUrl(`/tenders/${slug}`) },
        ])}
      />
      {/* Header */}
      <div className="mb-2 flex items-center gap-2 text-sm text-neutral-500">
        <span aria-hidden>{countryFlag(tender.country)}</span>
        <span>{countryName(tender.country, loc)}</span>
        {tender.sectorPrimary && (
          <>
            <span>·</span>
            <span>{sectorName(tender.sectorPrimary, loc)}</span>
          </>
        )}
      </div>
      <h1 className="text-2xl font-semibold leading-tight text-neutral-900 sm:text-3xl">
        {title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <DeadlineChip closingAt={tender.closingAt} status={tender.status} locale={loc} />
        {tender.buyerNameRaw && (
          <span className="text-sm text-neutral-600">{tender.buyerNameRaw}</span>
        )}
      </div>

      {/* CTA row */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          size="lg"
          render={<a href={`/go/${tender.id}`} target="_blank" rel="noopener" />}
        >
          {t("goToSource")}
          <ExternalLinkIcon className="ml-1.5 size-4" />
        </Button>
        {/* Page is ISR-cached, so saved-state starts false; add is idempotent. */}
        <WatchlistButton
          tenderId={tender.id}
          initialSaved={false}
          labels={{ save: t("save"), saved: t("savedLabel") }}
        />
      </div>

      {/* AI summary */}
      {summary && (
        <section className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <h2 className="text-sm font-semibold text-neutral-900">{t("summaryTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">{summary}</p>
          <p className="mt-3 text-xs text-neutral-400">{t("summaryDisclaimer")}</p>
        </section>
      )}

      {/* Key facts */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("keyFacts")}</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-xl border border-neutral-200 p-5 sm:grid-cols-2">
          {facts
            .filter((f) => f.value)
            .map((fact) => (
              <div key={fact.label} className="flex justify-between gap-4 text-sm">
                <dt className="text-neutral-500">{fact.label}</dt>
                <dd className="text-right font-medium text-neutral-900">{fact.value}</dd>
              </div>
            ))}
        </dl>
      </section>

      {/* Eligibility */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("eligibility")}</h2>
        <div className="rounded-xl border border-neutral-200 p-5 text-sm text-neutral-700">
          {tender.eligibilityNotesEn || tender.eligibilityNotesTr ? (
            <p>
              {locale === "tr" && tender.eligibilityNotesTr
                ? tender.eligibilityNotesTr
                : tender.eligibilityNotesEn}
            </p>
          ) : tender.eligibilityCountries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tender.eligibilityCountries.map((code) => (
                <Badge key={code} variant="secondary">
                  {countryFlag(code)} {countryName(code, loc)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500">{t("eligibilityOpen")}</p>
          )}
        </div>
      </section>

      {/* Timeline */}
      {timeline.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("timeline")}</h2>
          <ol className="space-y-2 rounded-xl border border-neutral-200 p-5">
            {timeline.map((item) => (
              <li key={item.label} className="flex justify-between text-sm">
                <span className="text-neutral-500">{item.label}</span>
                <span className="font-medium text-neutral-900">
                  {formatDate(item.date, loc)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* How to apply */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("howToApply")}</h2>
        <ol className="list-inside list-decimal space-y-2 rounded-xl border border-neutral-200 p-5 text-sm text-neutral-700">
          {(["one", "two", "three", "four", "five"] as const).map((step) => (
            <li key={step}>{t(`applySteps.${step}`)}</li>
          ))}
        </ol>
      </section>

      {/* Documents */}
      {docs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("documents")}</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {docs.map((doc) => (
              <li key={doc.id}>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener nofollow"
                  className="flex items-center gap-3 p-4 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <FileTextIcon className="size-4 text-neutral-400" />
                  <span className="flex-1 truncate">{doc.title ?? doc.url}</span>
                  {doc.fileType && (
                    <Badge variant="outline" className="uppercase">
                      {doc.fileType}
                    </Badge>
                  )}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-400">{t("documentsNote")}</p>
        </section>
      )}

      {/* Source trust block */}
      <section className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
        <h2 className="text-sm font-semibold text-neutral-900">{t("sourceTrust")}</h2>
        <p className="mt-1 text-sm text-neutral-600">{t("sourceTrustNote")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-medium text-neutral-900">{source.name}</span>
          <a
            href={`/go/${tender.id}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-neutral-700 underline hover:text-neutral-900"
          >
            {t("viewOriginal")}
            <ExternalLinkIcon className="size-3.5" />
          </a>
          <span className="text-xs text-neutral-400">
            {t("lastSynced")}: {formatDate(tender.lastSeenAt, loc)}
          </span>
        </div>
      </section>

      {/* Similar tenders */}
      {similar.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">{t("similar")}</h2>
          <div className="space-y-3">
            {similar.map((hit) => (
              <TenderCard key={hit.id} tender={hit} locale={loc} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-10">
        <Link href="/search" className="text-sm text-neutral-500 underline hover:text-neutral-800">
          ← {loc === "tr" ? "Aramaya dön" : "Back to search"}
        </Link>
      </div>
    </main>
  );
}
