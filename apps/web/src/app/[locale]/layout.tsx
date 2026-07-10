import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { ClerkProvider } from "@clerk/nextjs";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/layout/site-header";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

const DESCRIPTION =
  "Search, track and win public and private-sector tenders worldwide. Alerts, summaries and direct links to original sources.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tenderlist — Global tender discovery",
    template: "%s · Tenderlist",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Tenderlist — Global tender discovery",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <ClerkProvider>
      <html lang={locale}>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <NextIntlClientProvider>
            <SiteHeader />
            {children}
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
