import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";

const strings = {
  en: {
    preview: "You've reached a Free-plan limit on Tenderlist",
    heading: "You've reached a plan limit",
    body: "You're getting real use out of Tenderlist — you've hit a limit on the Free plan. Upgrade to Starter or Pro for unlimited search, the full archive, faster alerts and more.",
    cta: "See plans",
  },
  tr: {
    preview: "Tenderlist'te Ücretsiz plan limitinize ulaştınız",
    heading: "Plan limitinize ulaştınız",
    body: "Tenderlist'i aktif kullanıyorsunuz — Ücretsiz plandaki bir limite ulaştınız. Sınırsız arama, tam arşiv, daha hızlı uyarılar ve fazlası için Starter veya Pro'ya yükseltin.",
    cta: "Planları gör",
  },
} as const;

export interface QuotaHitEmailProps {
  locale?: "en" | "tr";
  appUrl?: string;
}

export default function QuotaHitEmail({
  locale = "en",
  appUrl = "https://tenderlist.app",
}: QuotaHitEmailProps) {
  const t = strings[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale} appUrl={appUrl}>
      <Heading as="h1" style={{ fontSize: "22px", margin: "0 0 16px", color: "#111827" }}>
        {t.heading}
      </Heading>
      <Text style={{ fontSize: "15px", lineHeight: "24px", color: "#374151" }}>{t.body}</Text>
      <Button
        href={`${appUrl}/pricing`}
        style={{
          backgroundColor: "#111827",
          borderRadius: "8px",
          color: "#ffffff",
          fontSize: "14px",
          fontWeight: 600,
          padding: "12px 20px",
          marginTop: "8px",
        }}
      >
        {t.cta}
      </Button>
    </EmailLayout>
  );
}
