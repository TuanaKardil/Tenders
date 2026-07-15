import { Skeleton } from "@/components/ui/skeleton";

export default function AlertsLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Skeleton className="mb-8 h-8 w-40" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </main>
  );
}
