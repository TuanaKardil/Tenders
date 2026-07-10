import { cn } from "@/lib/utils";
import { daysUntil, formatDate } from "@/lib/format";

interface DeadlineChipProps {
  closingAt: number | Date | null;
  status: string;
  locale?: string;
  className?: string;
}

/** Color-coded closing countdown: green >14d, amber 3-14d, red <3d, gray closed. */
export function DeadlineChip({ closingAt, status, locale = "en", className }: DeadlineChipProps) {
  const days = daysUntil(closingAt);
  const isClosed = status === "closed" || status === "cancelled" || (days !== null && days < 0);

  let tone = "bg-neutral-100 text-neutral-600 border-neutral-200";
  let label: string;

  if (isClosed) {
    label = locale === "tr" ? "Kapandı" : "Closed";
  } else if (days === null) {
    label = locale === "tr" ? "Tarih belirsiz" : "No deadline";
  } else {
    label =
      locale === "tr"
        ? days === 0
          ? "Bugün kapanıyor"
          : `${days} gün kaldı`
        : days === 0
          ? "Closes today"
          : `${days} day${days === 1 ? "" : "s"} left`;
    if (days < 3) tone = "bg-red-50 text-red-700 border-red-200";
    else if (days <= 14) tone = "bg-amber-50 text-amber-700 border-amber-200";
    else tone = "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone,
        className
      )}
      title={closingAt ? formatDate(closingAt, locale) : undefined}
    >
      {label}
    </span>
  );
}
