"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkIcon, BookmarkCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist } from "@/server/actions/watchlist";

interface WatchlistButtonProps {
  tenderId: string;
  initialSaved: boolean;
  labels: { save: string; saved: string };
}

export function WatchlistButton({ tenderId, initialSaved, labels }: WatchlistButtonProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = saved
        ? await removeFromWatchlist(tenderId)
        : await addToWatchlist(tenderId);
      if (result.ok) {
        setSaved(!saved);
      } else if (result.code === "auth") {
        router.push("/sign-in");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <Button variant="outline" size="lg" onClick={toggle} disabled={pending}>
        {saved ? (
          <BookmarkCheckIcon className="size-4 text-emerald-600" />
        ) : (
          <BookmarkIcon className="size-4" />
        )}
        {saved ? labels.saved : labels.save}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
