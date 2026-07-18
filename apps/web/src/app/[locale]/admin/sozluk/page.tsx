import { eq, sql, desc } from "drizzle-orm";
import { db, noticeTypeMappings, tenders } from "@repo/db";
import { NOTICE_TYPES } from "@repo/config/constants";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reviewMapping } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSozlukPage() {
  const pending = await db
    .select()
    .from(noticeTypeMappings)
    .where(eq(noticeTypeMappings.status, "pending_review"))
    .orderBy(desc(noticeTypeMappings.createdAt));

  // How many tenders carry each pending phrase (rough match on the raw text).
  const seenCounts = new Map<string, number>();
  for (const m of pending) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tenders)
      .where(
        sql`lower(regexp_replace(trim(coalesce(notice_type_raw, '')), '\\s+', ' ', 'g')) = ${m.rawText}`
      );
    seenCounts.set(m.id, row?.n ?? 0);
  }

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
      ai: sql<number>`count(*) filter (where origin = 'ai')::int`,
      human: sql<number>`count(*) filter (where origin = 'human')::int`,
    })
    .from(noticeTypeMappings);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Bildirim tipi sözlüğü — bekleyen eşlemeler</h1>
        <span className="text-sm text-neutral-500">{pending.length} bekleyen</span>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Kaynaklardan gelen ham tip ifadeleri sözlükte yoksa AI sınıflandırır. Emin olamadıkları
        (güven &lt; 0.8) buraya düşer; sen onaylayana kadar ilgili ihaleler{" "}
        <code className="rounded bg-neutral-100 px-1">unknown</code> olarak akar.
      </p>

      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">
          toplam <b>{stats?.total ?? 0}</b>
        </span>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">
          aktif <b>{stats?.active ?? 0}</b>
        </span>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">
          AI öğrendi <b>{stats?.ai ?? 0}</b>
        </span>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1">
          insan onaylı <b>{stats?.human ?? 0}</b>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ham ifade</TableHead>
              <TableHead>Kaynak</TableHead>
              <TableHead>AI önerisi</TableHead>
              <TableHead>Güven</TableHead>
              <TableHead>Görüldüğü ihale</TableHead>
              <TableHead>Karar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-neutral-500">
                  Bekleyen eşleme yok — sözlük güncel.
                </TableCell>
              </TableRow>
            )}
            {pending.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="max-w-[240px] font-mono text-xs">{m.rawText}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{m.sourceSlug ?? "genel"}</TableCell>
                <TableCell className="text-sm">
                  <b>{m.mappedEnum}</b>
                  {m.reasoning && (
                    <div className="max-w-[220px] text-xs text-neutral-500">{m.reasoning}</div>
                  )}
                </TableCell>
                <TableCell className="text-sm">{m.confidence?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className="text-center text-sm">{seenCounts.get(m.id) ?? 0}</TableCell>
                <TableCell>
                  <form action={reviewMapping} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      name="action"
                      value="approve"
                      className="rounded border border-green-600 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                    >
                      Onayla
                    </button>
                    <select
                      name="enum"
                      defaultValue={m.mappedEnum}
                      className="rounded border border-neutral-300 px-1 py-1 text-xs"
                    >
                      {NOTICE_TYPES.map((nt) => (
                        <option key={nt} value={nt}>
                          {nt}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      name="action"
                      value="correct"
                      className="rounded border border-neutral-400 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                    >
                      Düzelt
                    </button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
