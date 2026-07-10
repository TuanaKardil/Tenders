import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of gated content when a free-plan quota is exhausted.
 * Presentational — the caller passes already-translated strings.
 */
export function UpgradePrompt({
  title,
  description,
  ctaLabel,
}: {
  title: string;
  description: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center">
      <p className="text-sm font-medium text-neutral-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">{description}</p>
      <Button size="sm" className="mt-4" render={<Link href="/pricing" />}>
        {ctaLabel}
      </Button>
    </div>
  );
}
