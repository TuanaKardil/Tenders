"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { countryName, sectorName } from "@/lib/format";

export interface FacetGroup {
  param: string;
  title: string;
  values: Record<string, number>;
  kind: "country" | "sector" | "status" | "source";
}

interface FacetSidebarProps {
  groups: FacetGroup[];
  locale: "en" | "tr";
}

const STATUS_LABELS: Record<string, { en: string; tr: string }> = {
  open: { en: "Open", tr: "Açık" },
  closing_soon: { en: "Closing soon", tr: "Yakında kapanıyor" },
  closed: { en: "Closed", tr: "Kapandı" },
  cancelled: { en: "Cancelled", tr: "İptal edildi" },
  awarded: { en: "Awarded", tr: "Sonuçlandı" },
};

function facetLabel(kind: FacetGroup["kind"], value: string, locale: "en" | "tr") {
  switch (kind) {
    case "country":
      return countryName(value, locale);
    case "sector":
      return sectorName(value, locale);
    case "status":
      return STATUS_LABELS[value]?.[locale] ?? value;
    default:
      return value;
  }
}

export function FacetSidebar({ groups, locale }: FacetSidebarProps) {
  const router = useRouter();
  const params = useSearchParams();

  const toggle = useCallback(
    (param: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      const current = next.get(param)?.split(",").filter(Boolean) ?? [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length > 0) next.set(param, updated.join(","));
      else next.delete(param);
      next.delete("page");
      router.push(`/search?${next.toString()}`);
    },
    [params, router]
  );

  return (
    <aside className="w-full space-y-6 lg:w-60">
      {groups.map((group) => {
        const selected = new Set(
          params.get(group.param)?.split(",").filter(Boolean) ?? []
        );
        const entries = Object.entries(group.values).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0 && selected.size === 0) return null;
        return (
          <div key={group.param}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {group.title}
            </h3>
            <ul className="space-y-1.5">
              {entries.slice(0, 10).map(([value, count]) => {
                const id = `${group.param}-${value}`;
                return (
                  <li key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={selected.has(value)}
                      onCheckedChange={() => toggle(group.param, value)}
                    />
                    <Label
                      htmlFor={id}
                      className="flex flex-1 cursor-pointer items-center justify-between text-sm font-normal text-neutral-700"
                    >
                      <span className="truncate">
                        {facetLabel(group.kind, value, locale)}
                      </span>
                      <span className="ml-2 text-xs tabular-nums text-neutral-400">
                        {count}
                      </span>
                    </Label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </aside>
  );
}
