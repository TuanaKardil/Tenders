"use client";

import { useTransition, useState } from "react";
import { Trash2Icon } from "lucide-react";
import Link from "next/link";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteSavedSearch,
  updateSavedSearch,
} from "@/server/actions/saved-searches";

export interface AlertRowData {
  id: string;
  name: string;
  searchHref: string;
  alertEnabled: boolean;
  frequency: "instant" | "daily" | "weekly";
  lastResultCount: number;
  allowedFrequencies: string[];
}

interface AlertRowProps {
  data: AlertRowData;
  labels: {
    instant: string;
    daily: string;
    weekly: string;
    newResults: string;
    delete: string;
  };
}

export function AlertRow({ data, labels }: AlertRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(input: { alertEnabled?: boolean; frequency?: "instant" | "daily" | "weekly" }) {
    setError(null);
    startTransition(async () => {
      const result = await updateSavedSearch({ id: data.id, ...input });
      if (!result.ok) setError(result.error);
    });
  }

  const freqLabels = { instant: labels.instant, daily: labels.daily, weekly: labels.weekly };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href={data.searchHref}
            className="truncate text-sm font-semibold text-neutral-900 hover:underline"
          >
            {data.name}
          </Link>
          {data.lastResultCount > 0 && (
            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              +{data.lastResultCount} {labels.newResults}
            </span>
          )}
        </div>

        <Select
          value={data.frequency}
          onValueChange={(v) => update({ frequency: v as AlertRowData["frequency"] })}
          disabled={pending || !data.alertEnabled}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["instant", "daily", "weekly"] as const).map((f) => (
              <SelectItem key={f} value={f} disabled={!data.allowedFrequencies.includes(f)}>
                {freqLabels[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Switch
          checked={data.alertEnabled}
          onCheckedChange={(checked) => update({ alertEnabled: checked })}
          disabled={pending}
        />

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={labels.delete}
          disabled={pending}
          onClick={() => startTransition(async () => void (await deleteSavedSearch(data.id)))}
        >
          <Trash2Icon className="size-4 text-neutral-400" />
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
