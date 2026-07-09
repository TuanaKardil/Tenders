import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { use } from "react";
import { Link } from "@/i18n/navigation";

export default function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("landing");
  const common = useTranslations("common");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="mb-4 text-sm font-medium uppercase tracking-widest text-neutral-500">
        {common("appName")}
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
        {t("heroTitle")}
      </h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600">
        {t("heroSubtitle")}
      </p>
      <div className="mt-10 flex items-center gap-4">
        <Link
          href="/onboarding"
          className="rounded-lg bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          {t("ctaPrimary")}
        </Link>
        <Link
          href="/search"
          className="rounded-lg border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
        >
          {t("ctaSecondary")}
        </Link>
      </div>
    </main>
  );
}
