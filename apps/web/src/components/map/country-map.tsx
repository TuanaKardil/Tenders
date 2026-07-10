"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { COUNTRY_CENTROIDS } from "@/lib/country-centroids";
import { countryFlag, countryName } from "@/lib/format";

interface CountryMapProps {
  counts: Record<string, number>;
  locale: "en" | "tr";
  viewAllLabel: string;
}

export function CountryMap({ counts, locale, viewAllLabel }: CountryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Key-free style; swap for MapTiler when NEXT_PUBLIC_MAPTILER_KEY is set.
      style:
        process.env.NEXT_PUBLIC_MAPTILER_KEY
          ? `https://api.maptiler.com/maps/dataviz/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
          : "https://demotiles.maplibre.org/style.json",
      center: [17, 2],
      zoom: 2.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    const markers: maplibregl.Marker[] = [];
    const max = Math.max(1, ...Object.values(counts));

    for (const [code, count] of Object.entries(counts)) {
      const centroid = COUNTRY_CENTROIDS[code];
      if (!centroid || count === 0) continue;

      const el = document.createElement("button");
      const size = 26 + Math.round((count / max) * 26);
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:rgba(23,23,23,0.85);color:#fff;font-size:11px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;`;
      el.textContent = String(count);
      el.title = countryName(code, locale);
      el.addEventListener("click", () => setSelected(code));

      markers.push(
        new maplibregl.Marker({ element: el }).setLngLat(centroid).addTo(map)
      );
    }

    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
    };
  }, [counts, locale]);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border border-neutral-200">
      <div ref={containerRef} className="h-full w-full" />
      {selected && (
        <div className="absolute right-4 top-4 w-64 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg">{countryFlag(selected)}</div>
              <div className="font-semibold text-neutral-900">
                {countryName(selected, locale)}
              </div>
              <div className="text-sm text-neutral-500">
                {counts[selected] ?? 0} {locale === "tr" ? "ihale" : "tenders"}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-neutral-400 hover:text-neutral-700"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <Link
            href={`/search?country=${selected}`}
            className="mt-3 inline-block rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
          >
            {viewAllLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
