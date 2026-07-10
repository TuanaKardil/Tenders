import { Worker, type Job } from "bullmq";
import { createElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { db, alertDeliveries } from "@repo/db";
import { QUEUES, type EmailDispatchJob } from "@repo/config";
import WelcomeEmail from "@repo/emails/welcome";
import AlertDigestEmail, { type AlertDigestProps } from "@repo/emails/alert-digest";
import { connection } from "../connection";

const FROM = process.env.EMAIL_FROM ?? "Tenderlist <alerts@tenderlist.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tenderlist.app";

let resend: Resend | undefined;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resend) resend = new Resend(key);
  return resend;
}

function renderTemplate(job: EmailDispatchJob): Promise<string> {
  const common = { locale: job.locale, appUrl: APP_URL };
  switch (job.template) {
    case "welcome":
      return render(createElement(WelcomeEmail, { ...common, ...job.props }));
    case "alert-instant":
    case "alert-digest":
    case "weekly-digest":
      return render(
        createElement(AlertDigestEmail, {
          ...common,
          ...(job.props as unknown as AlertDigestProps),
        })
      );
    default:
      throw new Error(`no renderer for template ${job.template}`);
  }
}

const SUBJECTS: Record<EmailDispatchJob["template"], { en: string; tr: string }> = {
  welcome: { en: "Welcome to Tenderlist", tr: "Tenderlist'e hoş geldiniz" },
  "alert-instant": { en: "New tender matches", tr: "Yeni ihale eşleşmeleri" },
  "alert-digest": { en: "New tender matches", tr: "Yeni ihale eşleşmeleri" },
  "weekly-digest": { en: "Your weekly tender digest", tr: "Haftalık ihale özetiniz" },
  "quota-hit": { en: "You reached a plan limit", tr: "Plan limitinize ulaştınız" },
  "trial-payment-issue": { en: "Payment issue", tr: "Ödeme sorunu" },
};

export async function processEmailDispatch(job: Job<EmailDispatchJob>) {
  const data = job.data;
  const html = await renderTemplate(data);
  const searchName = (data.props as { searchName?: string }).searchName;
  const subject = searchName
    ? `${SUBJECTS[data.template][data.locale]} — ${searchName}`
    : SUBJECTS[data.template][data.locale];

  const client = getResend();
  let resendMessageId: string | null = null;
  let status: "sent" | "failed" = "sent";

  if (client) {
    const { data: sent, error } = await client.emails.send({
      from: FROM,
      to: data.to,
      subject,
      html,
    });
    if (error) {
      status = "failed";
      console.error(`[email-dispatch] resend error: ${error.message}`);
    } else {
      resendMessageId = sent?.id ?? null;
    }
  } else {
    // Dev mode without RESEND_API_KEY: log instead of sending.
    console.log(
      `[email-dispatch] (dev, not sent) to=${data.to} subject="${subject}" bytes=${html.length}`
    );
  }

  if (data.savedSearchId && data.userId) {
    await db.insert(alertDeliveries).values({
      savedSearchId: data.savedSearchId,
      userId: data.userId,
      tenderIds: data.tenderIds ?? [],
      resendMessageId,
      status,
    });
  }

  if (status === "failed") throw new Error("resend send failed");
  return { status, resendMessageId };
}

export function startEmailDispatchWorker() {
  return new Worker<EmailDispatchJob>(QUEUES.emailDispatch, processEmailDispatch, {
    connection,
    concurrency: 3,
  });
}
