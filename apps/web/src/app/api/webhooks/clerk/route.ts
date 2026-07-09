import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { db, users } from "@repo/db";

export const runtime = "nodejs";

interface ClerkUserEvent {
  type: "user.created" | "user.updated" | "user.deleted" | string;
  data: {
    id: string;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
}

/** Mirrors Clerk users into our users table. */
export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: ClerkUserEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const clerkId = event.data.id;

  if (event.type === "user.deleted") {
    await db.delete(users).where(eq(users.clerkId, clerkId));
    return NextResponse.json({ ok: true });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const primaryEmail =
      event.data.email_addresses?.find(
        (e) => e.id === event.data.primary_email_address_id
      )?.email_address ?? event.data.email_addresses?.[0]?.email_address;

    if (!primaryEmail) {
      return NextResponse.json({ error: "user has no email" }, { status: 422 });
    }

    const name =
      [event.data.first_name, event.data.last_name].filter(Boolean).join(" ") || null;

    await db
      .insert(users)
      .values({ clerkId, email: primaryEmail, name })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: { email: primaryEmail, name, updatedAt: new Date() },
      });
  }

  return NextResponse.json({ ok: true });
}
