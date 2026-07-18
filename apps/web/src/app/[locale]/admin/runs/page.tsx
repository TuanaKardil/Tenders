import { desc, eq, sql } from "drizzle-orm";
import { db, ingestionRuns, sources, documents, tenders, noticeTypeMappings } from "@repo/db";
import { Badge } from "@/components/ui/badge";
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

const STATUS_VARIANT = {
  running: "secondary",
  success: "default",
  partial: "secondary",
  failed: "destructive",
} as const;

function fmt(n: number): string {
  return n.toLocaleString("tr-TR");
}

export default async function AdminRunsPage() {
  const rows = await db
    .select({ run: ingestionRuns, sourceName: sources.name })
    .from(ingestionRuns)
    .innerJoin(sources, eq(ingestionRuns.sourceId, sources.id))
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(100);

  // ---- Document extraction stats ----
  const [docTotals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      extracted: sql<number>`count(*) filter (where extracted_text is not null)::int`,
      failed: sql<number>`count(*) filter (where extraction_method = 'failed')::int`,
      chars: sql<string>`coalesce(sum(length(extracted_text)), 0)`,
    })
    .from(documents);

  // Per extraction day: method distribution + fails. Documents carry no run id,
  // so the day bucket is the honest grouping — the pipeline runs daily anyway.
  const perDay = await db
    .select({
      day: sql<string>`date(extracted_at)`,
      total: sql<number>`count(*)::int`,
      pdf: sql<number>`count(*) filter (where extraction_method = 'pdf-parse')::int`,
      mammoth: sql<number>`count(*) filter (where extraction_method = 'mammoth')::int`,
      gemini: sql<number>`count(*) filter (where extraction_method = 'gemini-multimodal')::int`,
      failed: sql<number>`count(*) filter (where extraction_method = 'failed')::int`,
      chars: sql<string>`coalesce(sum(length(extracted_text)), 0)`,
    })
    .from(documents)
    .where(sql`extracted_at is not null`)
    .groupBy(sql`date(extracted_at)`)
    .orderBy(sql`date(extracted_at) desc`)
    .limit(30);

  // Failed documents with their tender, for the expandable detail.
  const failedDocs = await db
    .select({
      url: documents.url,
      title: documents.title,
      error: documents.extractionError,
      tenderId: tenders.id,
      tenderTitle: tenders.titleOriginal,
    })
    .from(documents)
    .innerJoin(tenders, eq(documents.tenderId, tenders.id))
    .where(eq(documents.extractionMethod, "failed"))
    .limit(50);

  const failRate =
    (docTotals?.total ?? 0) > 0
      ? (((docTotals?.failed ?? 0) / (docTotals?.total ?? 1)) * 100).toFixed(1)
      : "0";

  // ---- Normalize summary (per first_seen day) ----
  const normDays = await db
    .select({
      day: sql<string>`date(first_seen_at)`,
      created: sql<number>`count(*)::int`,
      noClosing: sql<number>`count(*) filter (where closing_at is null)::int`,
      noBudget: sql<number>`count(*) filter (where estimated_value_max is null and value_usd_est is null)::int`,
      noDocs: sql<number>`count(*) filter (where documents_count = 0)::int`,
    })
    .from(tenders)
    .groupBy(sql`date(first_seen_at)`)
    .orderBy(sql`date(first_seen_at) desc`)
    .limit(14);

  // notice_type distribution per day (compact "tender 88 · rfq 3" strings).
  const ntRows = await db
    .select({
      day: sql<string>`date(first_seen_at)`,
      nt: tenders.noticeType,
      n: sql<number>`count(*)::int`,
    })
    .from(tenders)
    .groupBy(sql`date(first_seen_at)`, tenders.noticeType)
    .orderBy(sql`date(first_seen_at) desc`, sql`count(*) desc`);
  const ntByDay = new Map<string, string>();
  for (const r of ntRows) {
    const prev = ntByDay.get(r.day);
    const part = `${r.nt ?? "—"} ${r.n}`;
    ntByDay.set(r.day, prev ? `${prev} · ${part}` : part);
  }

  // Dictionary learning per day (AI-learned mappings; DB-hit counts are
  // runtime-only and not persisted, so only learned rows are reportable).
  const dictRows = await db
    .select({
      day: sql<string>`date(created_at)`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
      pending: sql<number>`count(*) filter (where status = 'pending_review')::int`,
    })
    .from(noticeTypeMappings)
    .where(eq(noticeTypeMappings.origin, "ai"))
    .groupBy(sql`date(created_at)`);
  const dictByDay = new Map(dictRows.map((r) => [r.day, r]));

  /** Amber warning when ≥50% of a day's rows miss the field (source quality signal). */
  const warn = (missing: number, total: number) =>
    total > 0 && missing / total >= 0.5 ? "bg-amber-100 font-medium text-amber-900" : "";

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Çekim kayıtları</h1>

      {/* All-time document extraction cards */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-semibold">{fmt(docTotals?.total ?? 0)}</div>
          <div className="text-xs text-neutral-500">
            Toplam belge (metni çıkarılan: {fmt(docTotals?.extracted ?? 0)})
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-semibold">{fmt(Number(docTotals?.chars ?? 0))}</div>
          <div className="text-xs text-neutral-500">Çıkarılan toplam karakter</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className={`text-2xl font-semibold ${Number(failRate) > 5 ? "text-red-600" : ""}`}>
            %{failRate}
          </div>
          <div className="text-xs text-neutral-500">Başarısızlık oranı ({docTotals?.failed ?? 0} belge)</div>
        </div>
      </div>

      {/* Per-day extraction breakdown */}
      <h2 className="mb-2 text-sm font-medium text-neutral-700">Belge çıkarımı — günlük döküm</h2>
      <div className="mb-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gün</TableHead>
              <TableHead className="text-right">İşlenen</TableHead>
              <TableHead className="text-right">pdf-parse</TableHead>
              <TableHead className="text-right">mammoth</TableHead>
              <TableHead className="text-right">gemini</TableHead>
              <TableHead className="text-right">Başarısız</TableHead>
              <TableHead className="text-right">Karakter</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perDay.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-neutral-500">
                  Henüz belge çıkarımı yapılmadı.
                </TableCell>
              </TableRow>
            )}
            {perDay.map((d) => (
              <TableRow key={d.day}>
                <TableCell className="whitespace-nowrap">{d.day}</TableCell>
                <TableCell className="text-right">{d.total}</TableCell>
                <TableCell className="text-right">{d.pdf}</TableCell>
                <TableCell className="text-right">{d.mammoth}</TableCell>
                <TableCell className="text-right">{d.gemini}</TableCell>
                <TableCell className={`text-right ${d.failed > 0 ? "font-medium text-red-600" : ""}`}>
                  {d.failed}
                </TableCell>
                <TableCell className="text-right text-xs text-neutral-500">
                  {fmt(Number(d.chars))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Expandable failed-document detail */}
      {failedDocs.length > 0 && (
        <details className="mb-6 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-red-800">
            Başarısız belgeler ({failedDocs.length}) — detay için aç
          </summary>
          <ul className="mt-2 space-y-2">
            {failedDocs.map((f) => (
              <li key={f.url} className="rounded border border-red-100 bg-white p-2 text-xs">
                <Link href={`/admin/tenders/${f.tenderId}`} className="font-medium hover:underline">
                  {f.tenderTitle.slice(0, 90)}
                </Link>
                <div className="truncate text-neutral-500">{f.title ?? f.url}</div>
                <div className="text-red-700">{f.error ?? "—"}</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Normalize summary per day */}
      <h2 className="mb-2 text-sm font-medium text-neutral-700">Normalize özeti — günlük</h2>
      <p className="mb-2 text-xs text-neutral-500">
        Amber hücre: o gün gelen kayıtların %50+&apos;sinde alan boş (kaynak kalite sinyali).
      </p>
      <div className="mb-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gün</TableHead>
              <TableHead className="text-right">Yeni ihale</TableHead>
              <TableHead>notice_type dağılımı</TableHead>
              <TableHead className="text-right">Kapanış yok</TableHead>
              <TableHead className="text-right">Bütçe yok</TableHead>
              <TableHead className="text-right">Belge yok</TableHead>
              <TableHead>Sözlük öğrenme</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {normDays.map((d) => {
              const dict = dictByDay.get(d.day);
              return (
                <TableRow key={d.day}>
                  <TableCell className="whitespace-nowrap">{d.day}</TableCell>
                  <TableCell className="text-right font-medium">{d.created}</TableCell>
                  <TableCell className="max-w-[260px] text-xs text-neutral-600">
                    {ntByDay.get(d.day) ?? "—"}
                  </TableCell>
                  <TableCell className={`text-right ${warn(d.noClosing, d.created)}`}>
                    {d.noClosing}
                  </TableCell>
                  <TableCell className={`text-right ${warn(d.noBudget, d.created)}`}>
                    {d.noBudget}
                  </TableCell>
                  <TableCell className={`text-right ${warn(d.noDocs, d.created)}`}>
                    {d.noDocs}
                  </TableCell>
                  <TableCell className="text-xs text-neutral-600">
                    {dict ? `${dict.active} aktif · ${dict.pending} beklemede` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Scrape runs */}
      <h2 className="mb-2 text-sm font-medium text-neutral-700">Kaynak çekim koşuları</h2>
      <div className="rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kaynak</TableHead>
              <TableHead>Başlangıç</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">Gelen</TableHead>
              <TableHead className="text-right">Yeni</TableHead>
              <TableHead className="text-right">Mükerrer</TableHead>
              <TableHead className="text-right">Hatalı</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-neutral-500">
                  Henüz koşu kaydı yok — bir sonraki backfill/pipeline koşusunda burada görünecek.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ run, sourceName }) => (
              <TableRow key={run.id}>
                <TableCell className="font-medium">{sourceName}</TableCell>
                <TableCell>{run.startedAt.toISOString().slice(0, 16).replace("T", " ")}</TableCell>
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
