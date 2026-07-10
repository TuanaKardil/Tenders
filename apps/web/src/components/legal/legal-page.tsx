import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type LegalSection = "terms" | "privacy" | "takedown";

/** Shared shell for the static legal pages. Content lives in the `legal` i18n namespace. */
export async function LegalPage({ section }: { section: LegalSection }) {
  const t = await getTranslations("legal");
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t("draftNotice")}
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
        {t(`${section}.title`)}
      </h1>
      <p className="mt-5 text-sm leading-relaxed text-neutral-700">{t(`${section}.body`)}</p>
      <p className="mt-10 text-xs text-neutral-400">
        {t("contact")}{" "}
        <a href="mailto:hello@tenderlist.app" className="underline">
          hello@tenderlist.app
        </a>
      </p>
      <div className="mt-6">
        <Link href="/" className="text-sm text-neutral-500 underline hover:text-neutral-800">
          ← Tenderlist
        </Link>
      </div>
    </main>
  );
}
