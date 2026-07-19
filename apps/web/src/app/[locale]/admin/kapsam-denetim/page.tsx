import { desc, eq, sql } from "drizzle-orm";
import { db, documentCoverageAudits, tenders, sources } from "@repo/db";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Coverage spot-check audits (6c) — independent per-run document recount. */
export default async function AdminKapsamDenetimPage() {
  const audits = await db
    .select({
      a: documentCoverageAudits,
      title: tenders.titleOriginal,
      tenderId: tenders.id,
      slug: sources.slug,
    })
    .from(documentCoverageAudits)
    .innerJoin(tenders, eq(documentCoverageAudits.tenderId, tenders.id))
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .orderBy(desc(documentCoverageAudits.sampledAt))
    .limit(30);

  // Per-source mismatch rate (expected > actual) over the recent audits.
  const perSource = await db
    .select({
      slug: sources.slug,
      total: sql<number>`cast(count(*) as int)`,
      mismatches: sql<number>`cast(count(*) filter (where ${documentCoverageAudits.expectedCount} > ${documentCoverageAudits.actualCount}) as int)`,
    })
    .from(documentCoverageAudits)
    .innerJoin(tenders, eq(documentCoverageAudits.tenderId, tenders.id))
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .groupBy(sources.slug);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Kapsam denetimi — nokta atışı</h1>
      <p className="mb-5 max-w-3xl text-sm text-neutral-500">
        Her koşuda, detay çekilen kaynaklardan 1 rastgele ihalenin sitesi{" "}
        <b>bağımsızca yeniden sayılır</b>: sayfadaki PDF/DOC linkleri vs DB&apos;deki belge sayısı.
        Sayfa fazla gösteriyorsa (site 5, DB 3) seçici bir şeyi kaçırıyor demektir.
      </p>

      {/* Per-source mismatch rate */}
      <div className="mb-6 flex flex-wrap gap-2">
        {perSource.length === 0 && (
          <span className="text-sm text-neutral-400">Henüz denetim örneklemi yok.</span>
        )}
        {perSource.map((s) => {
          const rate = s.total > 0 ? Math.round((100 * s.mismatches) / s.total) : 0;
          const bad = rate > 20;
          return (
            <span
              key={s.slug}
              className={`rounded-full border px-3 py-1 text-xs ${
                bad ? "border-red-300 bg-red-100 text-red-800" : "border-neutral-200 bg-neutral-50 text-neutral-700"
              }`}
            >
              {s.slug} · fark %{rate} ({s.mismatches}/{s.total})
              {bad && " · seçici kırık olabilir"}
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>İhale</TableHead>
              <TableHead>Kaynak</TableHead>
              <TableHead className="text-right">Sayfada</TableHead>
              <TableHead className="text-right">DB&apos;de</TableHead>
              <TableHead>Kaçırılan URL&apos;ler</TableHead>
              <TableHead>Zaman</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audits.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-neutral-500">
                  Henüz denetim örneklemi yok — bir sonraki koşuda oluşacak.
                </TableCell>
              </TableRow>
            )}
            {audits.map(({ a, title, tenderId, slug }) => {
              const mismatch = a.expectedCount > a.actualCount;
              return (
                <TableRow key={a.id} className={mismatch ? "bg-red-50/50" : ""}>
                  <TableCell className="max-w-[260px]">
                    <Link href={`/admin/tenders/${tenderId}`} className="line-clamp-2 text-sm hover:underline">
                      {title}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs font-medium">{slug}</TableCell>
                  <TableCell className="text-right">{a.expectedCount}</TableCell>
                  <TableCell className={`text-right ${mismatch ? "font-semibold text-red-600" : ""}`}>
                    {a.actualCount}
                  </TableCell>
                  <TableCell className="max-w-[280px] text-xs text-red-700">
                    {a.missedUrls.length > 0 ? (
                      <ul className="space-y-0.5">
                        {a.missedUrls.slice(0, 3).map((u) => (
                          <li key={u} className="truncate">{u.split("/").pop()}</li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-neutral-500">
                    {a.sampledAt.toISOString().slice(0, 16).replace("T", " ")}
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
