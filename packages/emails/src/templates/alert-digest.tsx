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
    related: "Possibly relevant tenders",
    relatedNote: "Not exact keyword matches — surfaced because their content is semantically close to your search.",
  },
  tr: {
    preview: (n: number, name: string) => `“${name}” için ${n} yeni ihale`,
    heading: (name: string) => `“${name}” için yeni eşleşmeler`,
    intro: (n: number) => `Son uyarıdan bu yana kayıtlı aramanızla ${n} yeni ihale eşleşti.`,
    cta: "Tüm eşleşmeleri gör",
    more: (n: number) => `+ Tenderlist'te ${n} ihale daha`,
    related: "İlgili olabilecek ihaleler",
    relatedNote: "Birebir kelime eşleşmesi değil — içerikleri aramanıza anlamca yakın olduğu için gösteriliyor.",
  },
} as const;

export interface AlertDigestProps {
  locale?: "en" | "tr";
  appUrl?: string;
  searchName: string;
  searchUrl: string;
  tenders: EmailTender[];
  totalCount: number;
  /** Semantic-only matches, shown in a separate "possibly relevant" section. */
  relatedTenders?: EmailTender[];
}

const MAX_ROWS = 8;

export default function AlertDigestEmail({
  locale = "en",
  appUrl = "https://tenderlist.app",
  searchName,
  searchUrl,
  tenders,
  totalCount,
  relatedTenders = [],
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

      {relatedTenders.length > 0 && (
        <>
          <Heading as="h2" style={{ fontSize: "16px", margin: "24px 0 4px", color: "#111827" }}>
            {t.related}
          </Heading>
          <Text style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 12px" }}>
            {t.relatedNote}
          </Text>
          {relatedTenders.slice(0, MAX_ROWS).map((tender) => (
            <TenderRow key={tender.slug} tender={tender} locale={locale} appUrl={appUrl} />
          ))}
        </>
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
