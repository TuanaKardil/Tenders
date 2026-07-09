import type { LicenseClass } from "@repo/config/constants";

export interface SeedSource {
  slug: string;
  name: string;
  url: string;
  country: string | null;
  licenseClass: LicenseClass;
  cadence: string;
}

export const SEED_SOURCES: SeedSource[] = [
  { slug: "ke-tenders", name: "Kenya Public Procurement Portal", url: "https://tenders.go.ke", country: "KE", licenseClass: "green", cadence: "6h" },
  { slug: "gh-ppa", name: "Ghana Public Procurement Authority", url: "https://ppa.gov.gh", country: "GH", licenseClass: "green", cadence: "12h" },
  { slug: "ng-bpp", name: "Nigeria Bureau of Public Procurement", url: "https://bpp.gov.ng", country: "NG", licenseClass: "yellow", cadence: "12h" },
  { slug: "za-etenders", name: "South Africa eTenders Portal", url: "https://etenders.gov.za", country: "ZA", licenseClass: "green", cadence: "6h" },
  { slug: "tz-nest", name: "Tanzania National e-Procurement System", url: "https://nest.go.tz", country: "TZ", licenseClass: "yellow", cadence: "24h" },
  { slug: "rw-umucyo", name: "Rwanda Umucyo e-Procurement", url: "https://umucyo.gov.rw", country: "RW", licenseClass: "green", cadence: "24h" },
  { slug: "eg-etenders", name: "Egypt Government Tenders Portal", url: "https://etenders.gov.eg", country: "EG", licenseClass: "yellow", cadence: "24h" },
  { slug: "afdb", name: "African Development Bank Procurement", url: "https://afdb.org/procurement", country: null, licenseClass: "green", cadence: "24h" },
  { slug: "undp-africa", name: "UNDP Procurement Notices (Africa)", url: "https://procurement-notices.undp.org", country: null, licenseClass: "green", cadence: "24h" },
  { slug: "worldbank-africa", name: "World Bank Projects (Africa)", url: "https://projects.worldbank.org", country: null, licenseClass: "green", cadence: "24h" },
];

/** Countries with local currency + plausible USD rate for value_usd_est. */
export const SEED_COUNTRIES: { code: string; currency: string; usdRate: number }[] = [
  { code: "KE", currency: "KES", usdRate: 0.0077 },
  { code: "GH", currency: "GHS", usdRate: 0.065 },
  { code: "NG", currency: "NGN", usdRate: 0.00065 },
  { code: "ZA", currency: "ZAR", usdRate: 0.055 },
  { code: "TZ", currency: "TZS", usdRate: 0.00038 },
  { code: "RW", currency: "RWF", usdRate: 0.00072 },
  { code: "EG", currency: "EGP", usdRate: 0.02 },
  { code: "ET", currency: "ETB", usdRate: 0.0072 },
  { code: "UG", currency: "UGX", usdRate: 0.00026 },
  { code: "SN", currency: "XOF", usdRate: 0.0017 },
  { code: "CI", currency: "XOF", usdRate: 0.0017 },
  { code: "MA", currency: "MAD", usdRate: 0.1 },
  { code: "ZM", currency: "ZMW", usdRate: 0.036 },
  { code: "MZ", currency: "MZN", usdRate: 0.0156 },
  { code: "CM", currency: "XAF", usdRate: 0.0017 },
];

/** Title templates per sector; {x} slots filled by faker. */
export const SECTOR_TEMPLATES: Record<string, string[]> = {
  construction: [
    "Construction of {n} classroom blocks in {place}",
    "Rehabilitation of {place} district roads ({n} km)",
    "Design and build of {place} regional market complex",
    "Upgrading of storm water drainage in {place} municipality",
  ],
  energy: [
    "Supply and installation of {n} solar street lights in {place}",
    "Procurement of {n} MVA power transformers",
    "Rural electrification of {place} district — phase II",
    "Operation and maintenance of {place} mini-grid network",
  ],
  health: [
    "Supply of essential medicines to {place} county hospitals",
    "Procurement of {n} ambulances for regional health services",
    "Construction and equipping of maternity wing at {place} hospital",
    "Supply of laboratory reagents and consumables",
  ],
  ict: [
    "Supply, installation and commissioning of data centre equipment",
    "National broadband backbone extension to {place} region",
    "Development of integrated revenue management system",
    "Supply of {n} laptops and ICT accessories for schools",
  ],
  agriculture: [
    "Supply of certified maize seed and fertilizer for {place}",
    "Construction of {n} grain storage facilities in {place}",
    "Irrigation scheme development in {place} valley — {n} ha",
    "Procurement of agricultural mechanization equipment",
  ],
  transport: [
    "Periodic maintenance of {place} — {place2} trunk road",
    "Supply of {n} buses for urban transit service",
    "Consultancy for feasibility study of {place} bypass",
    "Rehabilitation of {place} airstrip pavement",
  ],
  water: [
    "Drilling and equipping of {n} boreholes in {place}",
    "Construction of {place} water treatment plant ({n} ML/day)",
    "Extension of sewer network in {place} municipality",
    "Supply of water meters and fittings — {n} units",
  ],
  education: [
    "Supply of textbooks and learning materials to {place} schools",
    "Construction of {place} technical training institute",
    "School feeding programme logistics services for {place}",
    "Supply and installation of science laboratory equipment",
  ],
  consulting: [
    "Consultancy services for {place} urban master plan",
    "Technical assistance for public financial management reform",
    "Independent audit of {place} infrastructure programme",
    "Baseline survey for {place} livelihoods project",
  ],
  goods: [
    "Supply of office furniture and equipment",
    "Framework contract for stationery and consumables",
    "Supply of {n} motor vehicles for government fleet",
    "Procurement of uniforms and protective clothing",
  ],
};

export const CITIES: Record<string, string[]> = {
  KE: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"],
  GH: ["Accra", "Kumasi", "Tamale", "Takoradi"],
  NG: ["Abuja", "Lagos", "Kano", "Port Harcourt", "Ibadan"],
  ZA: ["Johannesburg", "Cape Town", "Durban", "Pretoria"],
  TZ: ["Dar es Salaam", "Dodoma", "Mwanza", "Arusha"],
  RW: ["Kigali", "Huye", "Musanze"],
  EG: ["Cairo", "Alexandria", "Giza", "Aswan"],
  ET: ["Addis Ababa", "Dire Dawa", "Mekelle"],
  UG: ["Kampala", "Gulu", "Mbarara", "Jinja"],
  SN: ["Dakar", "Thiès", "Saint-Louis"],
  CI: ["Abidjan", "Yamoussoukro", "Bouaké"],
  MA: ["Rabat", "Casablanca", "Marrakesh", "Fès"],
  ZM: ["Lusaka", "Kitwe", "Ndola"],
  MZ: ["Maputo", "Beira", "Nampula"],
  CM: ["Yaoundé", "Douala", "Garoua"],
};

export const BUYER_PATTERNS = [
  "Ministry of {sector_word}",
  "{city} County Government",
  "{city} Municipal Council",
  "National {sector_word} Authority",
  "{city} Water and Sanitation Company",
  "State Department for {sector_word}",
];

export const SECTOR_WORDS: Record<string, string> = {
  construction: "Infrastructure",
  energy: "Energy",
  health: "Health",
  ict: "ICT and Digital Economy",
  agriculture: "Agriculture",
  transport: "Transport",
  water: "Water",
  education: "Education",
  consulting: "Planning",
  goods: "Public Works",
};
