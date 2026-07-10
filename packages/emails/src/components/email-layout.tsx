import * as React from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

const strings = {
  en: {
    manageAlerts: "Manage alerts",
    unsubscribe: "Unsubscribe",
    footer: "You are receiving this email because you have an account on Tenderlist.",
  },
  tr: {
    manageAlerts: "Uyarıları yönet",
    unsubscribe: "Abonelikten çık",
    footer: "Bu e-postayı Tenderlist hesabınız olduğu için alıyorsunuz.",
  },
} as const;

export interface EmailLayoutProps {
  preview: string;
  locale?: "en" | "tr";
  appUrl?: string;
  children: ReactNode;
}

export function EmailLayout({
  preview,
  locale = "en",
  appUrl = "https://tenderlist.app",
  children,
}: EmailLayoutProps) {
  const t = strings[locale];
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f6f7f9", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
        <Container style={{ margin: "0 auto", padding: "24px", maxWidth: "560px" }}>
          <Section
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e6e8eb",
              padding: "32px",
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: "#e6e8eb", margin: "24px 0 12px" }} />
          <Text style={{ color: "#8a919c", fontSize: "12px", lineHeight: "18px" }}>
            {t.footer}{" "}
            <Link href={`${appUrl}/alerts`} style={{ color: "#8a919c", textDecoration: "underline" }}>
              {t.manageAlerts}
            </Link>{" "}
            ·{" "}
            <Link href={`${appUrl}/alerts`} style={{ color: "#8a919c", textDecoration: "underline" }}>
              {t.unsubscribe}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
