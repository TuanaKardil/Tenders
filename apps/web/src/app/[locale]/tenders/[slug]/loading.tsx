import { Skeleton } from "@/components/ui/skeleton";

export default function TenderLoading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="h-9 w-4/5" />
      <div className="mt-3 flex gap-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <div className="mt-6 flex gap-3">
        <Skeleton className="h-11 w-40 rounded-lg" />
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="mt-8 h-40 w-full rounded-xl" />
      ))}
    </main>
  );
}
