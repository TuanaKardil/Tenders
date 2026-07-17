import { desc, eq } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { Link } from "@/i18n/navigation";
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

/** How many of the important optional fields are filled (a "completeness" gauge). */
function completeness(t: typeof tenders.$inferSelect): number {
  const checks = [
    t.closingAt,
    t.buyerNameRaw,
    t.sectorPrimary,
    t.valueUsdEst,
    t.summaryEn,
    t.publishedAt,
    t.documentsCount > 0,
    t.cpvCodes.length > 0,
    t.region || t.city,
  ];
  return checks.filter(Boolean).length;
}

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

export default async function AdminTendersPage() {
  const rows = await db
    .select({ t: tenders, sourceSlug: sources.slug })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .orderBy(desc(tenders.createdAt))
    .limit(200);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Tenders</h1>
        <span className="text-sm text-neutral-500">
          latest {rows.length} · tracking extraction quality
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Lang</TableHead>
              <TableHead>EN / TR</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Conf.</TableHead>
              <TableHead>Qual.</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Pub.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-neutral-500">
                  No tenders yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ t, sourceSlug }) => {
              const lowConf = (t.extractionConfidence ?? 1) < 0.7;
              return (
                <TableRow key={t.id} className={lowConf ? "bg-amber-50/50" : undefined}>
                  <TableCell className="max-w-[280px]">
                    <Link
                      href={`/admin/tenders/${t.id}`}
                      className="line-clamp-1 font-medium text-neutral-900 hover:underline"
                    >
                      {t.titleEn ?? t.titleOriginal}
                    </Link>
                    <div className="line-clamp-1 text-xs text-neutral-400">{t.slug}</div>
                  </TableCell>
                  <TableCell className="text-xs">{sourceSlug}</TableCell>
                  <TableCell>{t.country}</TableCell>
                  <TableCell className="uppercase">{t.languageOriginal}</TableCell>
                  <TableCell className="text-xs">
                    <span className={t.titleEn ? "text-emerald-600" : "text-neutral-300"}>
                      EN
                    </span>{" "}
                    /{" "}
                    <span className={t.titleTr ? "text-emerald-600" : "text-neutral-300"}>
                      TR
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.status}</Badge>
                  </TableCell>
                  <TableCell className={lowConf ? "font-medium text-amber-700" : undefined}>
                    {pct(t.extractionConfidence)}
                  </TableCell>
                  <TableCell>{pct(t.qualityScore)}</TableCell>
                  <TableCell className="text-xs text-neutral-500">
                    {completeness(t)}/9
                  </TableCell>
                  <TableCell>
                    {t.isPublished ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-neutral-300">✗</span>
                    )}
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
