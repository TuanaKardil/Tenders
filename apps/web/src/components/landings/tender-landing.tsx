import { Link } from "@/i18n/navigation";
import { TenderCard } from "@/components/tenders/tender-card";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import type { TenderDoc } from "@repo/config/search";

interface TenderLandingProps {
  heading: string;
  intro: string;
  stats: { value: number; label: string }[];
  tenders: TenderDoc[];
  faq: { question: string; answer: string }[];
  breadcrumb: { name: string; url: string }[];
  locale: "en" | "tr";
  browseHref: string;
  browseLabel: string;
  emptyLabel: string;
  faqTitle: string;
}

/** Shared shell for programmatic SEO landings (countries, sectors). */
export function TenderLanding({
  heading,
  intro,
  stats,
  tenders,
  faq,
  breadcrumb,
  locale,
  browseHref,
  browseLabel,
  emptyLabel,
  faqTitle,
}: TenderLandingProps) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <JsonLd data={breadcrumbLd(breadcrumb)} />
      <JsonLd data={faqLd(faq)} />

      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">{heading}</h1>
      <p className="mt-3 max-w-2xl text-neutral-600">{intro}</p>

      <div className="mt-6 flex items-center gap-10">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-2xl font-semibold tabular-nums text-neutral-900">
              {s.value.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
            </div>
            <div className="text-xs text-neutral-500">{s.label}</div>
          </div>
        ))}
        <Link
          href={browseHref}
          className="ml-auto rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
        >
          {browseLabel} →
        </Link>
      </div>

      <div className="mt-8 space-y-3">
        {tenders.length > 0 ? (
          tenders.map((hit) => <TenderCard key={hit.id} tender={hit} locale={locale} />)
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
            {emptyLabel}
          </div>
        )}
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">{faqTitle}</h2>
        <dl className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {faq.map((item) => (
            <div key={item.question} className="p-5">
              <dt className="text-sm font-medium text-neutral-900">{item.question}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-neutral-600">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
