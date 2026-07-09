import { asc } from "drizzle-orm";
import { db, sources } from "@repo/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function cadenceToMs(cadence: string): number {
  const match = /^(\d+)h$/.exec(cadence);
  return match ? Number(match[1]) * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

function healthOf(source: { isActive: boolean; lastRunAt: Date | null; cadence: string }) {
  if (!source.isActive) return { label: "disabled", variant: "outline" as const };
  if (!source.lastRunAt) return { label: "never ran", variant: "secondary" as const };
  const overdue = Date.now() - source.lastRunAt.getTime() > 2 * cadenceToMs(source.cadence);
  return overdue
    ? { label: "stale", variant: "destructive" as const }
    : { label: "healthy", variant: "default" as const };
}

export default async function AdminSourcesPage() {
  const rows = await db.select().from(sources).orderBy(asc(sources.name));

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Sources</h1>
      <div className="rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-neutral-500">
                  No sources yet. Run <code>pnpm db:seed</code> or register one.
                </TableCell>
              </TableRow>
            )}
            {rows.map((source) => {
              const health = healthOf(source);
              return (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="font-medium">{source.name}</div>
                    <div className="text-xs text-neutral-500">{source.slug}</div>
                  </TableCell>
                  <TableCell>{source.country ?? "multi"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        source.licenseClass === "green"
                          ? "default"
                          : source.licenseClass === "yellow"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {source.licenseClass}
                    </Badge>
                  </TableCell>
                  <TableCell>{source.cadence}</TableCell>
                  <TableCell>
                    {source.lastRunAt
                      ? source.lastRunAt.toISOString().slice(0, 16).replace("T", " ")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={health.variant}>{health.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
