import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/server/auth";
import { planFor } from "@/server/plan";
import { PricingTable } from "@/components/pricing/pricing-table";

export const metadata: Metadata = { title: "Pricing" };

interface PricingPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PricingPage({ params, searchParams }: PricingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const user = await getCurrentUser();
  const currentPlan = user ? await planFor(user.id) : "free";

  return (
    <main>
      <PricingTable
        user={user ? { id: user.id, email: user.email } : null}
        currentPlan={currentPlan}
        showLimitBanner={Boolean(sp.limit)}
      />
    </main>
  );
}
