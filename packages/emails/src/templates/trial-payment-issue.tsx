import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";

const strings = {
  en: {
    preview: "There was a problem with your Tenderlist payment",
    heading: "We couldn't process your payment",
    body: "Your latest Tenderlist payment didn't go through, so your subscription is at risk of pausing. Please update your payment method to keep your plan active.",
    cta: "Update payment",
  },
  tr: {
    preview: "Tenderlist ödemenizde bir sorun oluştu",
    heading: "Ödemenizi alamadık",
    body: "Son Tenderlist ödemeniz gerçekleşmedi ve aboneliğiniz duraklama riskiyle karşı karşıya. Planınızı aktif tutmak için lütfen ödeme yönteminizi güncelleyin.",
    cta: "Ödemeyi güncelle",
  },
} as const;

export interface TrialPaymentIssueEmailProps {
  locale?: "en" | "tr";
  appUrl?: string;
}

export default function TrialPaymentIssueEmail({
  locale = "en",
  appUrl = "https://tenderlist.app",
}: TrialPaymentIssueEmailProps) {
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
