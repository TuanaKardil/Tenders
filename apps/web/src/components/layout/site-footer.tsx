import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const legal = await getTranslations("legal");
  const locale = await getLocale();
  const pricingLabel = locale === "tr" ? "Fiyatlandırma" : "Pricing";

  return (
    <footer className="mt-16 border-t border-white/10 bg-[#050d1f]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-white/60">
        <span className="font-semibold text-white">Tenderlist</span>
        <Link href="/pricing" className="hover:text-white">
          {pricingLabel}
        </Link>
        <Link href="/terms" className="hover:text-white">
          {legal("terms.title")}
        </Link>
        <Link href="/privacy" className="hover:text-white">
          {legal("privacy.title")}
        </Link>
        <Link href="/takedown" className="hover:text-white">
          {legal("takedown.title")}
        </Link>
        <span className="ml-auto text-white/40">© 2026 Tenderlist</span>
      </div>
    </footer>
  );
}
