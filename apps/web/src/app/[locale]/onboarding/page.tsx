import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Get started",
  robots: { index: false },
};

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("onboarding");
  const loc = locale === "tr" ? "tr" : "en";

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mb-2 text-center text-2xl font-semibold text-neutral-900">
        {t("title")}
      </h1>
      <p className="mb-10 text-center text-sm text-neutral-500">{t("subtitle")}</p>
      <OnboardingWizard
        locale={loc}
        labels={{
          stepSectors: t("steps.sectors"),
          stepCountries: t("steps.countries"),
          stepKeywords: t("steps.keywords"),
          sectorsHint: t("hints.sectors"),
          countriesHint: t("hints.countries"),
          keywordsHint: t("hints.keywords"),
          keywordsPlaceholder: t("keywordsPlaceholder"),
          back: t("back"),
          next: t("next"),
          finish: t("finish"),
          error: t("error"),
        }}
      />
    </main>
  );
}
