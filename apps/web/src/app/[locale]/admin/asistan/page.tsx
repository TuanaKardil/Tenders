import { desc, eq, sql } from "drizzle-orm";
import { db, aiUsageEvents, users, tenders } from "@repo/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function fmtUsd(n: number): string {
  return `$${n.toFixed(3)}`;
}

/** AI assistant monitoring — everything derives from ai_usage_events. */
export default async function AdminAsistanPage() {
  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01");

  const [totals] = await db
    .select({
      all: sql<number>`count(*)::int`,
      month: sql<number>`count(*) filter (where created_at >= ${monthStart})::int`,
      monthCost: sql<number>`coalesce(sum(estimated_cost) filter (where created_at >= ${monthStart}), 0)`,
      cached: sql<number>`count(*) filter (where status = 'cached')::int`,
      failed: sql<number>`count(*) filter (where status = 'error')::int`,
      oos: sql<number>`count(*) filter (where status = 'out_of_scope')::int`,
      notFound: sql<number>`count(*) filter (where status = 'not_found')::int`,
    })
    .from(aiUsageEvents);

  const perUser = await db
    .select({
      email: users.email,
      n: sql<number>`count(*)::int`,
      cost: sql<number>`coalesce(sum(estimated_cost), 0)`,
    })
    .from(aiUsageEvents)
    .innerJoin(users, eq(aiUsageEvents.userId, users.id))
    .groupBy(users.email)
    .orderBy(sql`count(*) desc`)
    .limit(20);

  const perTender = await db
    .select({
      title: tenders.titleOriginal,
      slug: tenders.slug,
      n: sql<number>`count(*)::int`,
    })
    .from(aiUsageEvents)
    .innerJoin(tenders, eq(aiUsageEvents.tenderId, tenders.id))
    .groupBy(tenders.titleOriginal, tenders.slug)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  const recentFailed = await db
    .select({ createdAt: aiUsageEvents.createdAt, model: aiUsageEvents.model, tenderId: aiUsageEvents.tenderId })
    .from(aiUsageEvents)
    .where(eq(aiUsageEvents.status, "error"))
    .orderBy(desc(aiUsageEvents.createdAt))
    .limit(10);

  const t = totals!;
  const cards: { label: string; value: string; warn?: boolean }[] = [
    { label: "Toplam soru (tüm zamanlar)", value: String(t.all) },
    { label: "Bu ay soru", value: String(t.month) },
    { label: "Bu ay tahmini maliyet", value: fmtUsd(t.monthCost) },
    { label: "Cache isabeti", value: t.all ? `%${Math.round((100 * t.cached) / t.all)}` : "—" },
    { label: "Kapsam dışı red", value: String(t.oos) },
    { label: "Başarısız istek", value: String(t.failed), warn: t.failed > 0 },
  ];

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Yapay zeka asistanı — kullanım</h1>
      <p className="mb-5 text-sm text-neutral-500">
        Tüm rakamlar <code className="rounded bg-neutral-100 px-1">ai_usage_events</code>{" "}
        defterinden; kotalar/limitler aynı tablodan sayılır.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className={`text-2xl font-semibold ${c.warn ? "text-red-600" : ""}`}>{c.value}</div>
            <div className="text-xs text-neutral-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Kullanıcı bazında</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead className="text-right">Soru</TableHead>
                  <TableHead className="text-right">Maliyet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perUser.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-neutral-500">
                      Henüz kullanım yok.
                    </TableCell>
                  </TableRow>
                )}
                {perUser.map((u) => (
                  <TableRow key={u.email}>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell className="text-right">{u.n}</TableCell>
                    <TableCell className="text-right text-xs">{fmtUsd(u.cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">En çok sorulan ihaleler</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İhale</TableHead>
                  <TableHead className="text-right">Soru</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perTender.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="py-6 text-center text-neutral-500">
                      Henüz kullanım yok.
                    </TableCell>
                  </TableRow>
                )}
                {perTender.map((r) => (
                  <TableRow key={r.slug}>
                    <TableCell className="max-w-[300px] truncate text-sm">{r.title}</TableCell>
                    <TableCell className="text-right">{r.n}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {recentFailed.length > 0 && (
        <details className="mt-6 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-red-800">
            Son başarısız istekler ({recentFailed.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {recentFailed.map((f, i) => (
              <li key={i}>
                {f.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {f.model} · tender{" "}
                {f.tenderId.slice(0, 8)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
