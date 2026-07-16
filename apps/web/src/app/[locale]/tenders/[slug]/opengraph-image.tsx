import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { db, tenders } from "@repo/db";
import { countryName, formatUsd } from "@/lib/format";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tender on Tenderlist";

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug, locale } = await params;
  const loc = locale === "tr" ? "tr" : "en";

  const [row] = await db
    .select({
      titleEn: tenders.titleEn,
      titleTr: tenders.titleTr,
      titleOriginal: tenders.titleOriginal,
      country: tenders.country,
      valueUsdEst: tenders.valueUsdEst,
    })
    .from(tenders)
    .where(eq(tenders.slug, slug))
    .limit(1);

  const title =
    (loc === "tr" && row?.titleTr ? row.titleTr : row?.titleEn ?? row?.titleOriginal) ??
    "Tenderlist";
  const clamped = title.length > 110 ? `${title.slice(0, 110)}…` : title;
  const value = row ? formatUsd(row.valueUsdEst ? Number(row.valueUsdEst) : null) : null;
  const country = row ? countryName(row.country, loc) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 6, color: "#6b7280" }}>TENDERLIST</div>
        <div style={{ fontSize: 60, fontWeight: 700, color: "#111827", lineHeight: 1.15 }}>
          {clamped}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 30 }}>
          <div style={{ width: 40, height: 8, background: "#2563eb", borderRadius: 4 }} />
          {country && <span style={{ color: "#374151" }}>{country}</span>}
          {value && <span style={{ color: "#6b7280" }}>· {value}</span>}
        </div>
      </div>
    ),
    size
  );
}
