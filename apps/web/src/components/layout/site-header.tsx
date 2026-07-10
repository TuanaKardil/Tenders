import { getTranslations } from "next-intl/server";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const common = await getTranslations("common");

  const nav = [
    { href: "/search", label: t("search") },
    { href: "/map", label: t("map") },
    { href: "/dashboard", label: t("dashboard") },
    { href: "/watchlist", label: t("watchlist") },
    { href: "/alerts", label: t("alerts") },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="text-sm font-bold tracking-tight text-neutral-900">
          {common("appName")}
        </Link>
        <nav className="hidden items-center gap-5 sm:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <LocaleSwitcher />
          <SignedOut>
            <Link href="/sign-in" className="text-sm text-neutral-600 hover:text-neutral-900">
              {common("signIn")}
            </Link>
            <Button size="sm" render={<Link href="/sign-up" />}>
              {common("signUp")}
            </Button>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
