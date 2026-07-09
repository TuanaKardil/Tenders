import { defineRouting } from "next-intl/routing";
import { LOCALES, DEFAULT_LOCALE } from "@repo/config/constants";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // "/" serves English, "/tr" serves Turkish.
  localePrefix: "as-needed",
});
