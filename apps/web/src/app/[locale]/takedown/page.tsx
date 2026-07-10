import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/legal/legal-page";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("legal");
  return { title: t("takedown.title"), alternates: alternatesFor("/takedown", locale) };
}

export default async function TakedownPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage section="takedown" />;
}
