import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tenderlist — Global tender discovery";

export default function OgImage() {
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
        <div style={{ fontSize: 30, letterSpacing: 6, color: "#6b7280" }}>TENDERLIST</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.1,
          }}
        >
          <span>Every tender, worldwide.</span>
          <span>One search away.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 8, background: "#059669", borderRadius: 4 }} />
          <div style={{ fontSize: 28, color: "#6b7280" }}>
            Search, track and win public-sector tenders worldwide
          </div>
        </div>
      </div>
    ),
    size
  );
}
