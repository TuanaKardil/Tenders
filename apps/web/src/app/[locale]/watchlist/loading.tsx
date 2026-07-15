import { Skeleton } from "@/components/ui/skeleton";

export default function WatchlistLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Skeleton className="mb-8 h-8 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
