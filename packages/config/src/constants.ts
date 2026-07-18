export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const TENDER_STATUSES = [
  "open",
  "closing_soon",
  "closed",
  "cancelled",
  "awarded",
] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

/** Days before closing_at at which status flips open -> closing_soon. */
export const CLOSING_SOON_DAYS = 7;

export const LICENSE_CLASSES = ["green", "yellow", "red"] as const;
export type LicenseClass = (typeof LICENSE_CLASSES)[number];

/** Canonical notice-type enum — mirrors the DB pgEnum and drives normalizeNoticeType(). */
export const NOTICE_TYPES = [
  "tender",
  "rfp",
  "rfq",
  "eoi",
  "prequalification",
  "award",
  "cancellation",
  "disposal",
  "vacancy",
  "unknown",
] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

export const PROCUREMENT_METHODS = [
  "open",
  "restricted",
  "direct",
  "framework",
  "quotation",
  "other",
] as const;

export const SECTORS = [
  { slug: "construction", en: "Construction & Infrastructure", tr: "İnşaat ve Altyapı" },
  { slug: "energy", en: "Energy & Utilities", tr: "Enerji ve Kamu Hizmetleri" },
  { slug: "health", en: "Health & Medical", tr: "Sağlık ve Tıp" },
  { slug: "ict", en: "ICT & Telecommunications", tr: "Bilişim ve Telekomünikasyon" },
  { slug: "agriculture", en: "Agriculture & Food", tr: "Tarım ve Gıda" },
  { slug: "transport", en: "Transport & Logistics", tr: "Ulaştırma ve Lojistik" },
  { slug: "water", en: "Water & Sanitation", tr: "Su ve Sanitasyon" },
  { slug: "education", en: "Education & Training", tr: "Eğitim ve Öğretim" },
  { slug: "consulting", en: "Consulting & Professional Services", tr: "Danışmanlık ve Profesyonel Hizmetler" },
  { slug: "goods", en: "Goods & Supplies", tr: "Mal ve Malzeme" },
  { slug: "security", en: "Security & Defense", tr: "Güvenlik ve Savunma" },
  { slug: "finance", en: "Financial Services", tr: "Finansal Hizmetler" },
  { slug: "environment", en: "Environment & Climate", tr: "Çevre ve İklim" },
  { slug: "mining", en: "Mining & Extractives", tr: "Madencilik" },
] as const;
export type SectorSlug = (typeof SECTORS)[number]["slug"];
export const SECTOR_SLUGS = SECTORS.map((s) => s.slug);

/** African countries first (launch focus), ISO 3166-1 alpha-2. */
export const COUNTRIES = [
  { code: "DZ", en: "Algeria", tr: "Cezayir" },
  { code: "AO", en: "Angola", tr: "Angola" },
  { code: "BJ", en: "Benin", tr: "Benin" },
  { code: "BW", en: "Botswana", tr: "Botsvana" },
  { code: "BF", en: "Burkina Faso", tr: "Burkina Faso" },
  { code: "BI", en: "Burundi", tr: "Burundi" },
  { code: "CM", en: "Cameroon", tr: "Kamerun" },
  { code: "CV", en: "Cape Verde", tr: "Yeşil Burun Adaları" },
  { code: "CF", en: "Central African Republic", tr: "Orta Afrika Cumhuriyeti" },
  { code: "TD", en: "Chad", tr: "Çad" },
  { code: "KM", en: "Comoros", tr: "Komorlar" },
  { code: "CG", en: "Congo", tr: "Kongo" },
  { code: "CD", en: "DR Congo", tr: "Demokratik Kongo Cumhuriyeti" },
  { code: "CI", en: "Côte d'Ivoire", tr: "Fildişi Sahili" },
  { code: "DJ", en: "Djibouti", tr: "Cibuti" },
  { code: "EG", en: "Egypt", tr: "Mısır" },
  { code: "GQ", en: "Equatorial Guinea", tr: "Ekvator Ginesi" },
  { code: "ER", en: "Eritrea", tr: "Eritre" },
  { code: "SZ", en: "Eswatini", tr: "Esvatini" },
  { code: "ET", en: "Ethiopia", tr: "Etiyopya" },
  { code: "GA", en: "Gabon", tr: "Gabon" },
  { code: "GM", en: "Gambia", tr: "Gambiya" },
  { code: "GH", en: "Ghana", tr: "Gana" },
  { code: "GN", en: "Guinea", tr: "Gine" },
  { code: "GW", en: "Guinea-Bissau", tr: "Gine-Bissau" },
  { code: "KE", en: "Kenya", tr: "Kenya" },
  { code: "LS", en: "Lesotho", tr: "Lesotho" },
  { code: "LR", en: "Liberia", tr: "Liberya" },
  { code: "LY", en: "Libya", tr: "Libya" },
  { code: "MG", en: "Madagascar", tr: "Madagaskar" },
  { code: "MW", en: "Malawi", tr: "Malavi" },
  { code: "ML", en: "Mali", tr: "Mali" },
  { code: "MR", en: "Mauritania", tr: "Moritanya" },
  { code: "MU", en: "Mauritius", tr: "Mauritius" },
  { code: "MA", en: "Morocco", tr: "Fas" },
  { code: "MZ", en: "Mozambique", tr: "Mozambik" },
  { code: "NA", en: "Namibia", tr: "Namibya" },
  { code: "NE", en: "Niger", tr: "Nijer" },
  { code: "NG", en: "Nigeria", tr: "Nijerya" },
  { code: "RW", en: "Rwanda", tr: "Ruanda" },
  { code: "ST", en: "São Tomé and Príncipe", tr: "Sao Tome ve Principe" },
  { code: "SN", en: "Senegal", tr: "Senegal" },
  { code: "SC", en: "Seychelles", tr: "Seyşeller" },
  { code: "SL", en: "Sierra Leone", tr: "Sierra Leone" },
  { code: "SO", en: "Somalia", tr: "Somali" },
  { code: "ZA", en: "South Africa", tr: "Güney Afrika" },
  { code: "SS", en: "South Sudan", tr: "Güney Sudan" },
  { code: "SD", en: "Sudan", tr: "Sudan" },
  { code: "TZ", en: "Tanzania", tr: "Tanzanya" },
  { code: "TG", en: "Togo", tr: "Togo" },
  { code: "TN", en: "Tunisia", tr: "Tunus" },
  { code: "UG", en: "Uganda", tr: "Uganda" },
  { code: "ZM", en: "Zambia", tr: "Zambiya" },
  { code: "ZW", en: "Zimbabwe", tr: "Zimbabve" },
  // Europe & other (added for global sources like TED and UNGM).
  { code: "AT", en: "Austria", tr: "Avusturya" },
  { code: "BE", en: "Belgium", tr: "Belçika" },
  { code: "BG", en: "Bulgaria", tr: "Bulgaristan" },
  { code: "HR", en: "Croatia", tr: "Hırvatistan" },
  { code: "CY", en: "Cyprus", tr: "Kıbrıs" },
  { code: "CZ", en: "Czechia", tr: "Çekya" },
  { code: "DK", en: "Denmark", tr: "Danimarka" },
  { code: "EE", en: "Estonia", tr: "Estonya" },
  { code: "FI", en: "Finland", tr: "Finlandiya" },
  { code: "FR", en: "France", tr: "Fransa" },
  { code: "DE", en: "Germany", tr: "Almanya" },
  { code: "GR", en: "Greece", tr: "Yunanistan" },
  { code: "HU", en: "Hungary", tr: "Macaristan" },
  { code: "IE", en: "Ireland", tr: "İrlanda" },
  { code: "IT", en: "Italy", tr: "İtalya" },
  { code: "LV", en: "Latvia", tr: "Letonya" },
  { code: "LT", en: "Lithuania", tr: "Litvanya" },
  { code: "LU", en: "Luxembourg", tr: "Lüksemburg" },
  { code: "MT", en: "Malta", tr: "Malta" },
  { code: "NL", en: "Netherlands", tr: "Hollanda" },
  { code: "PL", en: "Poland", tr: "Polonya" },
  { code: "PT", en: "Portugal", tr: "Portekiz" },
  { code: "RO", en: "Romania", tr: "Romanya" },
  { code: "SK", en: "Slovakia", tr: "Slovakya" },
  { code: "SI", en: "Slovenia", tr: "Slovenya" },
  { code: "ES", en: "Spain", tr: "İspanya" },
  { code: "SE", en: "Sweden", tr: "İsveç" },
  { code: "NO", en: "Norway", tr: "Norveç" },
  { code: "CH", en: "Switzerland", tr: "İsviçre" },
  { code: "GB", en: "United Kingdom", tr: "Birleşik Krallık" },
  { code: "TR", en: "Türkiye", tr: "Türkiye" },
  { code: "UA", en: "Ukraine", tr: "Ukrayna" },
  { code: "RS", en: "Serbia", tr: "Sırbistan" },
] as const;
export type CountryCode = (typeof COUNTRIES)[number]["code"];
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);

export const PLANS = {
  starter: { monthlyUsd: 19, annualUsd: 190 },
  pro: { monthlyUsd: 59, annualUsd: 590 },
} as const;
