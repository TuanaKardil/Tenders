import { desc, eq } from "drizzle-orm";
import { db, ingestionRuns, sources } from "@repo/db";
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

const STATUS_VARIANT = {
  running: "secondary",
  success: "default",
  partial: "secondary",
  failed: "destructive",
} as const;

export default async function AdminRunsPage() {
  const rows = await db
    .select({
      run: ingestionRuns,
      sourceName: sources.name,
    })
    .from(ingestionRuns)
    .innerJoin(sources, eq(ingestionRuns.sourceId, sources.id))
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(100);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Ingestion runs</h1>
      <div className="rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Duplicates</TableHead>
              <TableHead className="text-right">Failed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-neutral-500">
                  No ingestion runs yet. POST a batch to /api/ingest to see one.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ run, sourceName }) => (
              <TableRow key={run.id}>
                <TableCell className="font-medium">{sourceName}</TableCell>
                <TableCell>
                  {run.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                </TableCell>
                <TableCell className="text-right">{run.counts.received}</TableCell>
                <TableCell className="text-right">{run.counts.created}</TableCell>
                <TableCell className="text-right">{run.counts.duplicates}</TableCell>
                <TableCell className="text-right">{run.counts.failed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
