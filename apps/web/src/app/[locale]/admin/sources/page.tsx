import { asc, desc, eq, sql } from "drizzle-orm";
import { db, sources, ingestionRuns, tenders, documentCoverageAudits } from "@repo/db";
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

  // Consecutive-empty-run alarm: a source whose LAST TWO ingestion runs both
  // brought nothing (created=0 AND duplicates=0 — not just "all duplicates")
  // is likely broken. Fetch the last 2 runs per source.
  const recentRuns = await db
    .select({
      sourceId: ingestionRuns.sourceId,
      counts: ingestionRuns.counts,
      startedAt: ingestionRuns.startedAt,
    })
    .from(ingestionRuns)
    .orderBy(desc(ingestionRuns.startedAt));
  const runsBySource = new Map<string, typeof recentRuns>();
  for (const r of recentRuns) {
    const list = runsBySource.get(r.sourceId) ?? [];
    if (list.length < 2) list.push(r);
    runsBySource.set(r.sourceId, list);
  }
  const emptyAlarm = (sourceId: string): boolean => {
    const last2 = runsBySource.get(sourceId) ?? [];
    if (last2.length < 2) return false; // need two runs to call it consecutive
    return last2.every((r) => (r.counts.created ?? 0) === 0 && (r.counts.duplicates ?? 0) === 0);
  };

  // 6b — coverage anomaly: the last 3 days' avg documents/tender vs the 30-day
  // baseline. More than 30% below (with a meaningful sample) → amber.
  const recentDocs = await db
    .select({
      sourceId: tenders.sourceId,
      n: sql<number>`cast(count(*) as int)`,
      avgDocs: sql<number>`avg(${tenders.documentsCount})::float`,
    })
    .from(tenders)
    .where(sql`${tenders.firstSeenAt} >= now() - interval '3 days'`)
    .groupBy(tenders.sourceId);
  const recentBySource = new Map(recentDocs.map((r) => [r.sourceId, r]));
  const coverageDrop = (source: { id: string; avgDocsPerTender30d: number | null }): boolean => {
    const baseline = source.avgDocsPerTender30d ?? 0;
    if (baseline <= 0.1) return false; // no meaningful baseline (source has no docs anyway)
    const recent = recentBySource.get(source.id);
    if (!recent || recent.n < 3) return false; // too small a sample to judge
    return recent.avgDocs < baseline * 0.7;
  };

  // 6c — audit mismatch rate per source (expected > actual). >20% → red flag.
  const auditRates = await db
    .select({
      sourceId: tenders.sourceId,
      total: sql<number>`cast(count(*) as int)`,
      mismatches: sql<number>`cast(count(*) filter (where ${documentCoverageAudits.expectedCount} > ${documentCoverageAudits.actualCount}) as int)`,
    })
    .from(documentCoverageAudits)
    .innerJoin(tenders, eq(documentCoverageAudits.tenderId, tenders.id))
    .groupBy(tenders.sourceId);
  const auditBySource = new Map(auditRates.map((r) => [r.sourceId, r]));
  const selectorBroken = (sourceId: string): boolean => {
    const a = auditBySource.get(sourceId);
    if (!a || a.total < 3) return false; // need a few samples
    return a.mismatches / a.total > 0.2;
  };

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
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={health.variant}>{health.label}</Badge>
                      {emptyAlarm(source.id) && (
                        <Badge
                          variant="secondary"
                          className="border-amber-300 bg-amber-100 text-amber-800"
                          title="Son 2 koşuda hiç yeni/mükerrer kayıt gelmedi"
                        >
                          2+ koşu boş
                        </Badge>
                      )}
                      {coverageDrop(source) && (
                        <Badge
                          variant="secondary"
                          className="border-amber-300 bg-amber-100 text-amber-800"
                          title={`Son 3 günün belge oranı 30 gün ortalamasının (${source.avgDocsPerTender30d?.toFixed(2)}) %30+ altında`}
                        >
                          belge oranı düşük
                        </Badge>
                      )}
                      {selectorBroken(source.id) && (
                        <Badge
                          variant="destructive"
                          title="Denetim örneklemlerinin %20'sinden fazlasında sitede olan belge DB'de yok"
                        >
                          seçici kırılmış olabilir
                        </Badge>
                      )}
                    </div>
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
