import { COUNTRIES, SECTORS } from "@repo/config/constants";

const countryByCode = new Map(COUNTRIES.map((c) => [c.code, c]));
const sectorBySlug = new Map(SECTORS.map((s) => [s.slug, s]));

export function countryName(code: string, locale: "en" | "tr" = "en"): string {
  const entry = countryByCode.get(code as (typeof COUNTRIES)[number]["code"]);
  return entry ? entry[locale] : code;
}

export function sectorName(slug: string | null, locale: "en" | "tr" = "en"): string {
  if (!slug) return "";
  const entry = sectorBySlug.get(slug as (typeof SECTORS)[number]["slug"]);
  return entry ? entry[locale] : slug;
}

/** Regional-indicator emoji flag from ISO2 code. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

export function formatUsd(value: number | null): string | null {
  if (value === null || Number.isNaN(value)) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

export function formatDate(unixOrDate: number | Date | null, locale = "en"): string {
  if (unixOrDate === null) return "—";
  const date = typeof unixOrDate === "number" ? new Date(unixOrDate * 1000) : unixOrDate;
  return date.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function daysUntil(unixOrDate: number | Date | null): number | null {
  if (unixOrDate === null) return null;
  const ms =
    (typeof unixOrDate === "number" ? unixOrDate * 1000 : unixOrDate.getTime()) -
    Date.now();
  return Math.ceil(ms / 86_400_000);
}
