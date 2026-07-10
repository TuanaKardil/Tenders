import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db, savedSearches } from "@repo/db";
import { getCurrentUser } from "@/server/auth";
import { entitlementsForUser } from "@/server/plan";
import { AlertRow } from "@/components/alerts/alert-row";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = { title: "Alerts", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("alerts");

  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-neutral-500">
        {t("signInRequired")}
      </main>
    );
  }

  const [rows, ent] = await Promise.all([
    db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, user.id))
      .orderBy(desc(savedSearches.createdAt)),
    entitlementsForUser(user.id),
  ]);

  const enabledCount = rows.filter((r) => r.alertEnabled).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("usage", { used: enabledCount, max: ent.maxAlerts })}
          </p>
        </div>
        <Button render={<Link href="/search" />}>{t("newFromSearch")}</Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center">
          <p className="text-sm font-medium text-neutral-700">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-neutral-500">{t("empty.hint")}</p>
          <Button className="mt-4" render={<Link href="/onboarding" />}>
            {t("empty.cta")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <AlertRow
              key={row.id}
              data={{
                id: row.id,
                name: row.name,
                searchHref: buildSearchHref(row.query),
                alertEnabled: row.alertEnabled,
                frequency: row.frequency,
                lastResultCount: row.lastResultCount,
                allowedFrequencies: ent.allowedFrequencies,
              }}
              labels={{
                instant: t("frequency.instant"),
                daily: t("frequency.daily"),
                weekly: t("frequency.weekly"),
                newResults: t("newResults"),
                delete: t("delete"),
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function buildSearchHref(query: {
  q?: string;
  countries?: string[];
  sectors?: string[];
  status?: string[];
}): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.countries?.length) params.set("country", query.countries.join(","));
  if (query.sectors?.length) params.set("sector", query.sectors.join(","));
  if (query.status?.length) params.set("status", query.status.join(","));
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ""}`;
}
