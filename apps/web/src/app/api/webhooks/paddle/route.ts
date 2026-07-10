import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { Paddle, Environment, EventName } from "@paddle/paddle-node-sdk";
import { db, subscriptions, users } from "@repo/db";
import type { Plan } from "@repo/config";
import { enqueueEmail } from "@/server/queues";

export const runtime = "nodejs";

/** Paddle price id → our internal plan. Built from public env at module load. */
const PRICE_TO_PLAN: Record<string, Plan> = {};
for (const [id, plan] of [
  [process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY, "starter"],
  [process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_ANNUAL, "starter"],
  [process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY, "pro"],
  [process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_ANNUAL, "pro"],
] as const) {
  if (id) PRICE_TO_PLAN[id] = plan;
}

type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "paused";

function mapStatus(s: string): SubStatus {
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "paused":
    case "canceled":
      return s;
    default:
      return "canceled";
  }
}

/** Minimal projection of the Paddle Subscription entity we persist. */
interface SubData {
  id: string;
  customerId?: string | null;
  status: string;
  items?: { price?: { id?: string } }[];
  customData?: { userId?: string } | null;
  currentBillingPeriod?: { endsAt?: string } | null;
  scheduledChange?: { action?: string } | null;
}

function getPaddle(): Paddle | null {
  const key = process.env.PADDLE_API_KEY;
  if (!key) return null;
  return new Paddle(key, {
    environment:
      process.env.PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
  });
}

/** Webhook-driven entitlements: mirrors Paddle subscriptions into our table. */
export async function POST(request: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  const paddle = getPaddle();
  if (!secret || !paddle) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("paddle-signature") ?? "";
  const body = await request.text();

  let event: Awaited<ReturnType<typeof paddle.webhooks.unmarshal>>;
  try {
    event = await paddle.webhooks.unmarshal(body, secret, signature);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  if (!event) return NextResponse.json({ ok: true });

  const relevant =
    event.eventType === EventName.SubscriptionCreated ||
    event.eventType === EventName.SubscriptionActivated ||
    event.eventType === EventName.SubscriptionUpdated ||
    event.eventType === EventName.SubscriptionCanceled;
  if (!relevant) return NextResponse.json({ ok: true });

  const data = event.data as unknown as SubData;
  const userId = data.customData?.userId;
  if (!userId) {
    // No link back to our user — nothing to persist. (Log via response for debugging.)
    return NextResponse.json({ ok: true, skipped: "no userId in customData" });
  }

  const priceId = data.items?.[0]?.price?.id;
  const plan: Plan = (priceId && PRICE_TO_PLAN[priceId]) || "free";
  const status = mapStatus(data.status);
  const currentPeriodEnd = data.currentBillingPeriod?.endsAt
    ? new Date(data.currentBillingPeriod.endsAt)
    : null;
  const cancelAtPeriodEnd = data.scheduledChange?.action === "cancel";

  const values = {
    userId,
    paddleCustomerId: data.customerId ?? null,
    paddleSubscriptionId: data.id,
    plan,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    raw: data as unknown as Record<string, unknown>,
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { ...values, updatedAt: new Date() },
    });

  if (status === "past_due") {
    await notifyPaymentIssue(userId);
  }

  return NextResponse.json({ ok: true });
}

async function notifyPaymentIssue(userId: string) {
  const [u] = await db
    .select({ email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u?.email) return;
  await enqueueEmail({
    template: "trial-payment-issue",
    to: u.email,
    locale: u.locale === "tr" ? "tr" : "en",
    props: {},
    userId,
  });
}
