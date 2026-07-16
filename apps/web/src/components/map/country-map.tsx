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

/**
 * Interactive dark globe (MapLibre v5 globe projection) with glowing tender
 * bubbles per country. Idly auto-rotates until the user interacts; respects
 * prefers-reduced-motion.
 */
export function CountryMap({ counts, locale, viewAllLabel }: CountryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // Dark style to match the navy chrome; key-free fallback for dev.
      style: process.env.NEXT_PUBLIC_MAPTILER_KEY
        ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`
        : "https://demotiles.maplibre.org/style.json",
      center: [17, 8],
      zoom: 2.1,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    // Globe projection — the interactive twin of the landing hero's earth.
    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
    });

    const markers: maplibregl.Marker[] = [];
    const max = Math.max(1, ...Object.values(counts));

    for (const [code, count] of Object.entries(counts)) {
      const centroid = COUNTRY_CENTROIDS[code];
      if (!centroid || count === 0) continue;

      const el = document.createElement("button");
      const size = 28 + Math.round((count / max) * 26);
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:rgba(37,99,235,0.9);color:#fff;font-size:12px;font-weight:700;border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 14px rgba(59,130,246,0.65),0 0 34px rgba(59,130,246,0.3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s ease,box-shadow .15s ease;`;
      el.textContent = String(count);
      el.title = countryName(code, locale);
      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.15)";
        el.style.boxShadow =
          "0 0 20px rgba(59,130,246,0.9), 0 0 48px rgba(59,130,246,0.45)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
        el.style.boxShadow =
          "0 0 14px rgba(59,130,246,0.65), 0 0 34px rgba(59,130,246,0.3)";
      });
      el.addEventListener("click", () => setSelected(code));

      markers.push(
        new maplibregl.Marker({ element: el }).setLngLat(centroid).addTo(map)
      );
    }

    // Idle auto-rotation (like the hero video, but interactive). Stops for good
    // on first user interaction; skipped entirely under reduced motion.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let userInteracted = false;
    let raf = 0;
    const stopSpin = () => {
      userInteracted = true;
    };
    if (!reducedMotion) {
      map.on("mousedown", stopSpin);
      map.on("touchstart", stopSpin);
      map.on("wheel", stopSpin);
      const spin = () => {
        if (!userInteracted) {
          const center = map.getCenter();
          center.lng += 0.02;
          map.setCenter(center);
        }
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    }

    return () => {
      cancelAnimationFrame(raf);
      markers.forEach((m) => m.remove());
      map.remove();
    };
  }, [counts, locale]);

  return (
    <div className="relative h-[620px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#02040a]">
      <div ref={containerRef} className="h-full w-full" />
      {selected && (
        <div className="absolute right-4 top-4 w-64 rounded-xl border border-white/10 bg-[#0b1830]/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg">{countryFlag(selected)}</div>
              <div className="font-semibold text-white">
                {countryName(selected, locale)}
              </div>
              <div className="text-sm text-white/60">
                {counts[selected] ?? 0} {locale === "tr" ? "ihale" : "tenders"}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-white/40 hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <Link
            href={`/search?country=${selected}`}
            className="mt-3 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
          >
            {viewAllLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
