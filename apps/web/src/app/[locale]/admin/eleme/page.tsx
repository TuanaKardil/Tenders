import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
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

function shortDate(d: Date | null): string {
  return d
    ? d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
}

/** Turn a raw drop reason into a coarse bucket for the summary chips. */
function bucket(reason: string): string {
  const r = reason.toLowerCase();
  if (r.startsWith("ai:")) {
    // "AI: disposal — sale of vehicles" → "AI · disposal"
    const cat = r.slice(3).trim().split(/[—-]/)[0].trim();
    return `AI · ${cat || "diğer"}`;
  }
  if (r.includes("notice_type")) return "Kural · bildirim tipi";
  if (r.includes("title matches")) return "Kural · başlık";
  return "Diğer";
}

export default async function AdminElemePage() {
  // Dropped = has a recorded unpublish reason (set by the classification gate).
  const dropped = await db
    .select({ t: tenders, sourceSlug: sources.slug })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(isNotNull(tenders.unpublishReason))
    .orderBy(desc(tenders.lastSeenAt))
    .limit(500);

  // Totals for the headline numbers.
  const [totals] = await db
    .select({
      all: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${tenders.isPublished})::int`,
      droppedByGate: sql<number>`count(*) filter (where ${tenders.unpublishReason} is not null)::int`,
    })
    .from(tenders);

  // Dropped-per-source.
  const perSource = await db
    .select({ slug: sources.slug, n: sql<number>`count(*)::int` })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(isNotNull(tenders.unpublishReason))
    .groupBy(sources.slug)
    .orderBy(sql`count(*) desc`);

  // Group the dropped rows by reason bucket (done in JS — buckets are derived).
  const byBucket = new Map<string, number>();
  for (const { t } of dropped) {
    const b = bucket(t.unpublishReason ?? "");
    byBucket.set(b, (byBucket.get(b) ?? 0) + 1);
  }
  const buckets = [...byBucket.entries()].sort((a, b) => b[1] - a[1]);

  const droppedRate =
    totals.all > 0 ? ((totals.droppedByGate / totals.all) * 100).toFixed(1) : "0";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Sınıflandırma kapısı — elenen ihaleler</h1>
        <span className="text-sm text-neutral-500">{dropped.length} kayıt</span>
      </div>
      <p className="mb-5 text-sm text-neutral-500">
        Sınıflandırma kapısının <b>ihale değil</b> diye yayından kaldırdığı kayıtlar (award,
        disposal, iş ilanı, iptal vb.). Kayıtlar <b>silinmez</b>; yalnızca{" "}
        <code className="rounded bg-neutral-100 px-1">is_published=false</code> yapılır ve sebep
        saklanır — istenirse geri alınabilir.
      </p>

      {/* Headline numbers */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-semibold text-neutral-900">{totals.published}</div>
          <div className="text-xs text-neutral-500">Yayında (ihale)</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-semibold text-red-600">{totals.droppedByGate}</div>
          <div className="text-xs text-neutral-500">Kapıda elenen</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-2xl font-semibold text-neutral-900">%{droppedRate}</div>
          <div className="text-xs text-neutral-500">Eleme oranı</div>
        </div>
      </div>

      {/* Reason buckets + per-source */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Eleme sebebi</h2>
          <div className="flex flex-wrap gap-2">
            {buckets.length === 0 && (
              <span className="text-sm text-neutral-400">Henüz elenen kayıt yok.</span>
            )}
            {buckets.map(([b, n]) => (
              <span
                key={b}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700"
              >
                {b} · <b>{n}</b>
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Kaynağa göre</h2>
          <div className="flex flex-wrap gap-2">
            {perSource.length === 0 && (
              <span className="text-sm text-neutral-400">—</span>
            )}
            {perSource.map((s) => (
              <span
                key={s.slug}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700"
              >
                {s.slug} · <b>{s.n}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>İhale (orijinal başlık)</TableHead>
              <TableHead>Kaynak</TableHead>
              <TableHead>Ülke</TableHead>
              <TableHead>Bildirim tipi</TableHead>
              <TableHead>Eleme sebebi</TableHead>
              <TableHead>Elenme</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dropped.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-neutral-500">
                  Kapıda elenen ihale yok — tüm kayıtlar gerçek ihale.
                </TableCell>
              </TableRow>
            )}
            {dropped.map(({ t, sourceSlug }) => (
              <TableRow key={t.id}>
                <TableCell className="max-w-[280px]">
                  <Link
                    href={`/admin/tenders/${t.id}`}
                    className="line-clamp-2 font-medium text-neutral-900 hover:underline"
                  >
                    {t.titleOriginal}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs font-medium">{sourceSlug}</TableCell>
                <TableCell>{t.country}</TableCell>
                <TableCell className="max-w-[140px] truncate text-xs text-neutral-600">
                  {t.noticeType ?? "—"}
                </TableCell>
                <TableCell className="max-w-[320px] text-xs text-red-700">
                  {t.unpublishReason}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-neutral-500">
                  {shortDate(t.lastSeenAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
