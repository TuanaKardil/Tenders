import { createHmac, timingSafeEqual } from "node:crypto";

export interface IcsTender {
  id: string;
  title: string;
  slug: string;
  closingAt: Date;
  buyerName?: string | null;
  country?: string | null;
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Watchlist calendar: one all-day-style VEVENT per closing date with a
 * 3-day and a 1-day VALARM reminder.
 */
export function buildWatchlistIcs(tenders: IcsTender[], appUrl: string, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tenderlist//Watchlist//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Tenderlist deadlines",
  ];

  for (const tender of tenders) {
    const summary = icsEscape(`Tender closes: ${tender.title}`);
    const description = icsEscape(
      [tender.buyerName, tender.country, `${appUrl}/tenders/${tender.slug}`]
        .filter(Boolean)
        .join(" — ")
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:tender-${tender.id}@tenderlist`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(tender.closingAt)}`,
      `DTEND:${icsDate(tender.closingAt)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `URL:${appUrl}/tenders/${tender.slug}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Tender closing in 3 days",
      "TRIGGER:-P3D",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Tender closing tomorrow",
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 requires CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}

export function icsToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, 32);
}

export function verifyIcsToken(userId: string, token: string, secret: string): boolean {
  const expected = icsToken(userId, secret);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
