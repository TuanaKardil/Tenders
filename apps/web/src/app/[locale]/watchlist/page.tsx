import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlusIcon } from "lucide-react";
import { db, watchlistItems, tenders } from "@repo/db";
import { getCurrentUser } from "@/server/auth";
import { icsToken } from "@/lib/ics";
import { DeadlineChip } from "@/components/tenders/deadline-chip";
import { WatchlistButton } from "@/components/tenders/watchlist-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { countryFlag, countryName, formatDate, formatUsd } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";

export const metadata: Metadata = { title: "Watchlist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WatchlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("watchlist");
  const loc = locale === "tr" ? "tr" : "en";

  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-neutral-500">
        {t("signInRequired")}
      </main>
    );
  }

  const rows = await db
    .select({ item: watchlistItems, tender: tenders })
    .from(watchlistItems)
    .innerJoin(tenders, eq(watchlistItems.tenderId, tenders.id))
    .where(eq(watchlistItems.userId, user.id))
    .orderBy(asc(tenders.closingAt));

  const secret = process.env.ICS_SIGNING_SECRET;
  const icsHref = secret
    ? `/api/watchlist/ics?uid=${user.id}&token=${icsToken(user.id, secret)}`
    : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
        {icsHref && rows.length > 0 && (
          <Button variant="outline" render={<NextLink href={icsHref} />}>
            <CalendarPlusIcon className="size-4" />
            {t("icsExport")}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center">
          <p className="text-sm font-medium text-neutral-700">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-neutral-500">{t("empty.hint")}</p>
          <Button className="mt-4" render={<Link href="/search" />}>
            {t("empty.cta")}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.tender")}</TableHead>
                <TableHead>{t("columns.country")}</TableHead>
                <TableHead>{t("columns.value")}</TableHead>
                <TableHead>{t("columns.closing")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ tender }) => (
                <TableRow key={tender.id}>
                  <TableCell className="max-w-md">
                    <Link
                      href={`/tenders/${tender.slug}`}
                      className="line-clamp-2 text-sm font-medium text-neutral-900 hover:underline"
                    >
                      {loc === "tr" && tender.titleTr
                        ? tender.titleTr
                        : tender.titleEn ?? tender.titleOriginal}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {countryFlag(tender.country)} {countryName(tender.country, loc)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatUsd(tender.valueUsdEst ? Number(tender.valueUsdEst) : null) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <DeadlineChip
                        closingAt={tender.closingAt}
                        status={tender.status}
                        locale={loc}
                      />
                      <span className="text-xs text-neutral-400">
                        {formatDate(tender.closingAt, loc)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <WatchlistButton
                      tenderId={tender.id}
                      initialSaved
                      labels={{ save: t("save"), saved: t("remove") }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
