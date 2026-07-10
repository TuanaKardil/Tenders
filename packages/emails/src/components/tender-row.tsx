import * as React from "react";
import { Link, Section, Text } from "@react-email/components";

export interface EmailTender {
  slug: string;
  title: string;
  country: string;
  buyerName?: string | null;
  closingAt?: string | null;
  valueUsd?: string | null;
}

const strings = {
  en: { closing: "Closes", value: "Est. value" },
  tr: { closing: "Son tarih", value: "Tahmini bedel" },
} as const;

export function TenderRow({
  tender,
  locale = "en",
  appUrl = "https://tenderlist.app",
}: {
  tender: EmailTender;
  locale?: "en" | "tr";
  appUrl?: string;
}) {
  const t = strings[locale];
  const meta = [
    tender.country,
    tender.buyerName,
    tender.closingAt ? `${t.closing}: ${tender.closingAt}` : null,
    tender.valueUsd ? `${t.value}: ${tender.valueUsd}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Section
      style={{
        borderBottom: "1px solid #eef0f2",
        paddingBottom: "12px",
        marginBottom: "12px",
      }}
    >
      <Link
        href={`${appUrl}/tenders/${tender.slug}`}
        style={{ color: "#111827", fontSize: "14px", fontWeight: 600, textDecoration: "none" }}
      >
        {tender.title}
      </Link>
      <Text style={{ color: "#6b7280", fontSize: "12px", margin: "4px 0 0" }}>{meta}</Text>
    </Section>
  );
}
