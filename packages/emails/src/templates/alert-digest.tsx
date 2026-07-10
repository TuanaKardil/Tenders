import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import { TenderRow, type EmailTender } from "../components/tender-row";

const strings = {
  en: {
    preview: (n: number, name: string) => `${n} new tender${n === 1 ? "" : "s"} for “${name}”`,
    heading: (name: string) => `New matches for “${name}”`,
    intro: (n: number) =>
      `${n} new tender${n === 1 ? "" : "s"} matched your saved search since the last alert.`,
    cta: "View all matches",
    more: (n: number) => `+ ${n} more on Tenderlist`,
  },
  tr: {
    preview: (n: number, name: string) => `“${name}” için ${n} yeni ihale`,
    heading: (name: string) => `“${name}” için yeni eşleşmeler`,
    intro: (n: number) => `Son uyarıdan bu yana kayıtlı aramanızla ${n} yeni ihale eşleşti.`,
    cta: "Tüm eşleşmeleri gör",
    more: (n: number) => `+ Tenderlist'te ${n} ihale daha`,
  },
} as const;

export interface AlertDigestProps {
  locale?: "en" | "tr";
  appUrl?: string;
  searchName: string;
  searchUrl: string;
  tenders: EmailTender[];
  totalCount: number;
}

const MAX_ROWS = 8;

export default function AlertDigestEmail({
  locale = "en",
  appUrl = "https://tenderlist.app",
  searchName,
  searchUrl,
  tenders,
  totalCount,
}: AlertDigestProps) {
  const t = strings[locale];
  const shown = tenders.slice(0, MAX_ROWS);
  const remaining = totalCount - shown.length;

  return (
    <EmailLayout preview={t.preview(totalCount, searchName)} locale={locale} appUrl={appUrl}>
      <Heading as="h1" style={{ fontSize: "20px", margin: "0 0 8px", color: "#111827" }}>
        {t.heading(searchName)}
      </Heading>
      <Text style={{ fontSize: "14px", color: "#374151", margin: "0 0 20px" }}>
        {t.intro(totalCount)}
      </Text>

      {shown.map((tender) => (
        <TenderRow key={tender.slug} tender={tender} locale={locale} appUrl={appUrl} />
      ))}

      {remaining > 0 && (
        <Text style={{ fontSize: "13px", color: "#6b7280" }}>{t.more(remaining)}</Text>
      )}

      <Button
        href={searchUrl}
        style={{
          backgroundColor: "#111827",
          borderRadius: "8px",
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: 600,
          padding: "12px 20px",
          marginTop: "12px",
        }}
      >
        {t.cta}
      </Button>
    </EmailLayout>
  );
}
