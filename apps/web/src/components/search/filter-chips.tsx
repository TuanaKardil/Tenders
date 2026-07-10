"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";
import { countryName, sectorName } from "@/lib/format";

interface FilterChipsProps {
  locale: "en" | "tr";
  clearLabel: string;
}

const CHIP_PARAMS: { param: string; kind: "country" | "sector" | "status" | "source" }[] = [
  { param: "country", kind: "country" },
  { param: "sector", kind: "sector" },
  { param: "status", kind: "status" },
  { param: "source", kind: "source" },
];

export function FilterChips({ locale, clearLabel }: FilterChipsProps) {
  const router = useRouter();
  const params = useSearchParams();

  const chips: { param: string; value: string; label: string }[] = [];
  for (const { param, kind } of CHIP_PARAMS) {
    for (const value of params.get(param)?.split(",").filter(Boolean) ?? []) {
      const label =
        kind === "country"
          ? countryName(value, locale)
          : kind === "sector"
            ? sectorName(value, locale)
            : value.replace(/_/g, " ");
      chips.push({ param, value, label });
    }
  }
  if (chips.length === 0) return null;

  function remove(param: string, value: string) {
    const next = new URLSearchParams(params.toString());
    const updated = (next.get(param)?.split(",").filter(Boolean) ?? []).filter(
      (v) => v !== value
    );
    if (updated.length > 0) next.set(param, updated.join(","));
    else next.delete(param);
    next.delete("page");
    router.push(`/search?${next.toString()}`);
  }

  function clearAll() {
    const next = new URLSearchParams();
    const q = params.get("q");
    if (q) next.set("q", q);
    router.push(`/search?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={`${chip.param}-${chip.value}`}
          onClick={() => remove(chip.param, chip.value)}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {chip.label}
          <XIcon className="size-3" />
        </button>
      ))}
      <button
        onClick={clearAll}
        className="text-xs font-medium text-neutral-500 underline hover:text-neutral-800"
      >
        {clearLabel}
      </button>
    </div>
  );
}
