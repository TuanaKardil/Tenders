"use client";

import { useLocale } from "next-intl";
import { LOCALES } from "@repo/config/constants";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Compact EN · TR switcher. Keeps the current path and swaps the locale via
 * next-intl's Link `locale` prop. Automatic detection still applies on first
 * visit; this lets a user override it manually.
 */
export function LocaleSwitcher() {
  const active = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      {LOCALES.map((locale, i) => (
        <span key={locale} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-neutral-300">·</span>}
          <Link
            href={pathname}
            locale={locale}
            aria-current={locale === active ? "true" : undefined}
            className={
              locale === active
                ? "text-neutral-900"
                : "text-neutral-400 hover:text-neutral-700"
            }
          >
            {locale.toUpperCase()}
          </Link>
        </span>
      ))}
    </div>
  );
}
