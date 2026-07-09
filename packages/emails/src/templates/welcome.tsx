import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";

const strings = {
  en: {
    preview: "Welcome to Tenderlist — set your first alert in 3 minutes",
    heading: "Welcome to Tenderlist",
    body: "You're one step away from never missing a relevant tender again. Pick your sectors and countries, and we'll email you new opportunities the moment we find them.",
    cta: "Set up your first alert",
  },
  tr: {
    preview: "Tenderlist'e hoş geldiniz — ilk uyarınızı 3 dakikada kurun",
    heading: "Tenderlist'e hoş geldiniz",
    body: "İlgili ihaleleri bir daha asla kaçırmamaya bir adım uzaktasınız. Sektörlerinizi ve ülkelerinizi seçin, yeni fırsatları bulduğumuz anda size e-posta ile gönderelim.",
    cta: "İlk uyarınızı kurun",
  },
} as const;

export interface WelcomeEmailProps {
  locale?: "en" | "tr";
  appUrl?: string;
  name?: string;
}

export default function WelcomeEmail({
  locale = "en",
  appUrl = "https://tenderlist.app",
  name,
}: WelcomeEmailProps) {
  const t = strings[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale} appUrl={appUrl}>
      <Heading as="h1" style={{ fontSize: "22px", margin: "0 0 16px", color: "#111827" }}>
        {t.heading}
        {name ? `, ${name}` : ""}
      </Heading>
      <Text style={{ fontSize: "15px", lineHeight: "24px", color: "#374151" }}>{t.body}</Text>
      <Button
        href={`${appUrl}/onboarding`}
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
