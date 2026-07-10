import { PLANS } from "./constants";

export type BillingPeriod = "monthly" | "annual";
export type PaidPlan = "starter" | "pro";

/** USD price for a paid plan at a billing period. */
export function priceUsd(plan: PaidPlan, period: BillingPeriod): number {
  return period === "monthly" ? PLANS[plan].monthlyUsd : PLANS[plan].annualUsd;
}

/**
 * Names of the NEXT_PUBLIC env vars holding each Paddle price id.
 * Price ids are public (safe client-side); the client component reads them
 * with literal `process.env.NEXT_PUBLIC_...` access (required for Next inlining).
 */
export const PADDLE_PRICE_ENV = {
  starter: {
    monthly: "NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY",
    annual: "NEXT_PUBLIC_PADDLE_PRICE_STARTER_ANNUAL",
  },
  pro: {
    monthly: "NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY",
    annual: "NEXT_PUBLIC_PADDLE_PRICE_PRO_ANNUAL",
  },
} as const;
