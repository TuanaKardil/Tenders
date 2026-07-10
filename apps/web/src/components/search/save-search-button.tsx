"use client";

import { useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BellPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createSavedSearch } from "@/server/actions/saved-searches";

interface SaveSearchButtonProps {
  labels: {
    button: string;
    title: string;
    namePlaceholder: string;
    save: string;
    saved: string;
    goToAlerts: string;
  };
}

export function SaveSearchButton({ labels }: SaveSearchButtonProps) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function defaultName(): string {
    const parts = [
      params.get("q"),
      params.get("sector")?.split(",").slice(0, 2).join(", "),
      params.get("country")?.split(",").slice(0, 3).join(", "),
    ].filter(Boolean);
    return (parts.join(" · ") || "My search").slice(0, 80);
  }

  function save() {
    setError(null);
    const list = (key: string) => params.get(key)?.split(",").filter(Boolean) ?? undefined;
    startTransition(async () => {
      const result = await createSavedSearch({
        name: (name || defaultName()).slice(0, 80),
        query: {
          q: params.get("q") ?? undefined,
          countries: list("country"),
          sectors: list("sector"),
          status: list("status"),
          sources: list("source"),
        },
        alertEnabled: true,
        frequency: "weekly",
      });
      if (result.ok) {
        setSaved(true);
      } else if (result.code === "auth") {
        router.push("/sign-in");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setName(defaultName()); setSaved(false); setError(null); } }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <BellPlusIcon className="size-4" />
        {labels.button}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>
        {saved ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-neutral-700">{labels.saved}</p>
            <Button onClick={() => router.push("/alerts")}>{labels.goToAlerts}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={labels.namePlaceholder}
              maxLength={80}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button onClick={save} disabled={pending} className="w-full">
              {pending ? "…" : labels.save}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
