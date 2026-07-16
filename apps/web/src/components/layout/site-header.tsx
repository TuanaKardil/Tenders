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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050d1f]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-7 px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-white">
          {common("appName")}
        </Link>
        <nav className="hidden items-center gap-6 sm:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[15px] font-medium text-white/80 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <LocaleSwitcher />
          <SignedOut>
            <Link href="/sign-in" className="text-[15px] text-white/80 hover:text-white">
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
