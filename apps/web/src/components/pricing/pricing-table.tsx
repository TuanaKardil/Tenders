"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Check } from "lucide-react";
import { priceUsd, type BillingPeriod, type PaidPlan, type Plan } from "@repo/config";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Price ids are public; Next inlines NEXT_PUBLIC_* only via literal access.
const PRICE_IDS: Record<PaidPlan, Record<BillingPeriod, string | undefined>> = {
  starter: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY,
    annual: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_ANNUAL,
  },
  pro: {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY,
    annual: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_ANNUAL,
  },
};

const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;

interface PricingTableProps {
  user: { id: string; email: string } | null;
  currentPlan: Plan;
  showLimitBanner?: boolean;
}

export function PricingTable({ user, currentPlan, showLimitBanner }: PricingTableProps) {
  const t = useTranslations("pricing");
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [paddle, setPaddle] = useState<Paddle>();

  useEffect(() => {
    if (!CLIENT_TOKEN) return;
    initializePaddle({
      token: CLIENT_TOKEN,
      environment:
        (process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production") ?? "sandbox",
    }).then((p) => p && setPaddle(p));
  }, []);

  function checkout(plan: PaidPlan) {
    const priceId = PRICE_IDS[plan][period];
    if (!paddle || !priceId || !user) return;
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email: user.email },
      customData: { userId: user.id },
      settings: {
        displayMode: "overlay",
        theme: "light",
        successUrl: `${window.location.origin}/dashboard`,
      },
    });
  }

  const paid: PaidPlan[] = ["starter", "pro"];

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">{t("title")}</h1>
        <p className="mt-2 text-neutral-500">{t("subtitle")}</p>
      </div>

      {showLimitBanner && (
        <div className="mx-auto mt-6 max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          {t("limitBanner")}
        </div>
      )}

      {/* Billing period toggle */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <PeriodToggle period={period} onChange={setPeriod} labels={{ monthly: t("monthly"), annual: t("annual") }} />
        <span className="text-xs font-medium text-emerald-600">{t("annualSave")}</span>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {/* Free */}
        <PlanCard
          name={t("plans.free.name")}
          tagline={t("plans.free.tagline")}
          price="$0"
          period=""
          features={t.raw("plans.free.features") as string[]}
        >
          {currentPlan === "free" ? (
            <Button variant="outline" size="sm" className="w-full" disabled>
              {t("cta.current")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="w-full" render={<Link href="/search" />}>
              {t("cta.free")}
            </Button>
          )}
        </PlanCard>

        {/* Paid */}
        {paid.map((plan) => {
          const priceId = PRICE_IDS[plan][period];
          const canCheckout = Boolean(CLIENT_TOKEN && priceId && paddle && user);
          const isCurrent = currentPlan === plan;
          return (
            <PlanCard
              key={plan}
              name={t(`plans.${plan}.name`)}
              tagline={t(`plans.${plan}.tagline`)}
              price={`$${priceUsd(plan, period)}`}
              period={period === "monthly" ? t("perMonth") : t("perYear")}
              features={t.raw(`plans.${plan}.features`) as string[]}
              highlighted={plan === "starter"}
              badge={plan === "starter" ? t("mostPopular") : undefined}
            >
              {isCurrent ? (
                <Button size="sm" className="w-full" disabled>
                  {t("cta.current")}
                </Button>
              ) : !user ? (
                <Button size="sm" className="w-full" render={<Link href="/sign-in" />}>
                  {t("cta.signIn")}
                </Button>
              ) : (
                <div className="space-y-1.5">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!canCheckout}
                    onClick={() => checkout(plan)}
                  >
                    {t("cta.upgrade")}
                  </Button>
                  {!canCheckout && (
                    <p className="text-center text-xs text-neutral-400">{t("notConfigured")}</p>
                  )}
                </div>
              )}
            </PlanCard>
          );
        })}
      </div>
    </div>
  );
}

function PeriodToggle({
  period,
  onChange,
  labels,
}: {
  period: BillingPeriod;
  onChange: (p: BillingPeriod) => void;
  labels: { monthly: string; annual: string };
}) {
  return (
    <div className="inline-flex rounded-full border border-neutral-200 p-0.5 text-sm">
      {(["monthly", "annual"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "rounded-full px-4 py-1.5 transition-colors",
            period === p ? "bg-primary text-primary-foreground" : "text-neutral-600 hover:text-neutral-900"
          )}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  );
}

function PlanCard({
  name,
  tagline,
  price,
  period,
  features,
  highlighted,
  badge,
  children,
}: {
  name: string;
  tagline: string;
  price: string;
  period: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6",
        highlighted ? "border-primary shadow-sm" : "border-neutral-200"
      )}
    >
      {badge && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
          {badge}
        </span>
      )}
      <h3 className="text-lg font-semibold text-neutral-900">{name}</h3>
      <p className="mt-0.5 text-sm text-neutral-500">{tagline}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight text-neutral-900">{price}</span>
        {period && <span className="text-sm text-neutral-500">{period}</span>}
      </div>
      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-neutral-700">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{children}</div>
    </div>
  );
}
