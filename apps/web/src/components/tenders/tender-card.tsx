import Link from "next/link";
import type { TenderDoc } from "@repo/config/search";
import { Badge } from "@/components/ui/badge";
import { DeadlineChip } from "./deadline-chip";
import {
  countryFlag,
  countryName,
  formatDate,
  formatUsd,
  sectorName,
} from "@/lib/format";

interface TenderCardProps {
  tender: TenderDoc;
  locale?: "en" | "tr";
}

export function TenderCard({ tender, locale = "en" }: TenderCardProps) {
  const title = locale === "tr" && tender.title_tr ? tender.title_tr : tender.title_en;
  const summary =
    locale === "tr" && tender.summary_tr ? tender.summary_tr : tender.summary_en;
  const value = formatUsd(tender.value_usd_est);

  return (
    <Link
      href={`/tenders/${tender.slug}`}
      className="group block rounded-xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-neutral-900 group-hover:underline">
          {title}
        </h3>
        <DeadlineChip
          closingAt={tender.closing_at}
          status={tender.status}
          locale={locale}
          className="shrink-0"
        />
      </div>

      {summary && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-600">
          {summary}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>{countryFlag(tender.country)}</span>
          {countryName(tender.country, locale)}
        </span>
        {tender.sector_primary && (
          <Badge variant="secondary" className="font-normal">
            {sectorName(tender.sector_primary, locale)}
          </Badge>
        )}
        {tender.buyer_name && (
          <span className="max-w-56 truncate">{tender.buyer_name}</span>
        )}
        {value && <span className="font-medium text-neutral-700">{value}</span>}
        <span className="ml-auto">
          {locale === "tr" ? "Yayın" : "Published"}{" "}
          {formatDate(tender.published_at, locale)}
        </span>
      </div>
    </Link>
  );
}
