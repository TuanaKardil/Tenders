import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-6xl font-bold text-neutral-200">404</p>
      <h1 className="mt-4 text-xl font-semibold text-neutral-900">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-sm text-neutral-500">{t("notFoundHint")}</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
      >
        {t("backHome")}
      </Link>
    </main>
  );
}
