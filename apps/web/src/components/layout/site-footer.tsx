import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const legal = await getTranslations("legal");
  const locale = await getLocale();
  const pricingLabel = locale === "tr" ? "Fiyatlandırma" : "Pricing";

  return (
    <footer className="mt-16 border-t border-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-neutral-500">
        <span className="font-semibold text-neutral-700">Tenderlist</span>
        <Link href="/pricing" className="hover:text-neutral-900">
          {pricingLabel}
        </Link>
        <Link href="/terms" className="hover:text-neutral-900">
          {legal("terms.title")}
        </Link>
        <Link href="/privacy" className="hover:text-neutral-900">
          {legal("privacy.title")}
        </Link>
        <Link href="/takedown" className="hover:text-neutral-900">
          {legal("takedown.title")}
        </Link>
        <span className="ml-auto text-neutral-400">© 2026 Tenderlist</span>
      </div>
    </footer>
  );
}
