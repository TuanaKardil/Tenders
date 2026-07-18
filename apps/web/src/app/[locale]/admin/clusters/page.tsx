import { desc, eq, inArray } from "drizzle-orm";
import { db, dedupeClusters, dedupeCandidates, tenders, sources } from "@repo/db";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DetachButton } from "./detach-button";

export const dynamic = "force-dynamic";

const STATUS_TR: Record<string, string> = {
  merged: "birleştirildi",
  review: "onay bekliyor",
  rejected: "reddedildi",
  pending: "beklemede",
};

export default async function AdminClustersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const showCandidates = tab === "candidates";

  // ---- Clusters + members ----
  const clusters = await db
    .select()
    .from(dedupeClusters)
    .orderBy(desc(dedupeClusters.createdAt))
    .limit(100);

  const memberRows = clusters.length
    ? await db
        .select({ t: tenders, sourceSlug: sources.slug })
        .from(tenders)
        .innerJoin(sources, eq(tenders.sourceId, sources.id))
        .where(inArray(tenders.dedupeClusterId, clusters.map((c) => c.id)))
    : [];
  const membersByCluster = new Map<string, typeof memberRows>();
  for (const m of memberRows) {
    const k = m.t.dedupeClusterId!;
    const list = membersByCluster.get(k) ?? [];
    list.push(m);
    membersByCluster.set(k, list);
  }

  // Pair similarity (from judged candidates) so members can show a score.
  const candidates = await db
    .select()
    .from(dedupeCandidates)
    .orderBy(desc(dedupeCandidates.createdAt))
    .limit(200);
  const simByPair = new Map<string, number>();
  for (const c of candidates) {
    simByPair.set(`${c.tenderAId}|${c.tenderBId}`, c.similarity);
    simByPair.set(`${c.tenderBId}|${c.tenderAId}`, c.similarity);
  }

  // Candidate tab needs tender titles.
  const candTenderIds = [...new Set(candidates.flatMap((c) => [c.tenderAId, c.tenderBId]))];
  const candTenders = candTenderIds.length
    ? await db
        .select({ id: tenders.id, title: tenders.titleOriginal })
        .from(tenders)
        .where(inArray(tenders.id, candTenderIds))
    : [];
  const titleById = new Map(candTenders.map((t) => [t.id, t.title]));

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Dedup cluster&apos;ları</h1>
        <span className="text-sm text-neutral-500">
          {clusters.length} cluster · {candidates.length} hakem kararı
        </span>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Aynı ihalenin farklı kaynaklardaki kopyaları tek &quot;kanonik&quot; kayda bağlanır; aramada
        sadece primary görünür. Yanlış birleştirmeyi &quot;Ayır&quot; ile geri alabilirsin.
      </p>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-neutral-200">
        <Link
          href="/admin/clusters"
          className={`border-b-2 px-3 py-2 text-sm ${!showCandidates ? "border-neutral-900 font-medium" : "border-transparent text-neutral-500"}`}
        >
          Cluster&apos;lar
        </Link>
        <Link
          href="/admin/clusters?tab=candidates"
          className={`border-b-2 px-3 py-2 text-sm ${showCandidates ? "border-neutral-900 font-medium" : "border-transparent text-neutral-500"}`}
        >
          Hakem kararları
        </Link>
      </div>

      {!showCandidates ? (
        clusters.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white py-14 text-center text-neutral-500">
            Henüz cluster yok. Çakışan kaynaklar eklendikçe burada görünecek.
          </div>
        ) : (
          <div className="space-y-4">
            {clusters.map((c) => {
              const members = membersByCluster.get(c.id) ?? [];
              const primary = members.find((m) => m.t.id === c.canonicalTenderId);
              return (
                <div key={c.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
                    <span className="font-mono">{c.id.slice(0, 8)}</span>
                    <span>
                      {c.memberCount} üye · yöntem: {c.method} ·{" "}
                      {c.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {members.map((m) => {
                      const isPrimary = m.t.id === c.canonicalTenderId;
                      const sim = primary && !isPrimary
                        ? simByPair.get(`${primary.t.id}|${m.t.id}`)
                        : null;
                      return (
                        <li key={m.t.id} className="flex items-center gap-2 text-sm">
                          <span className={isPrimary ? "text-amber-600" : "text-neutral-300"}>
                            {isPrimary ? "★" : "·"}
                          </span>
                          <Link
                            href={`/admin/tenders/${m.t.id}`}
                            className="flex-1 truncate hover:underline"
                          >
                            {m.t.titleOriginal}
                          </Link>
                          <span className="text-xs text-neutral-500">[{m.sourceSlug}]</span>
                          {sim != null && (
                            <span className="text-xs text-neutral-400">sim {sim.toFixed(2)}</span>
                          )}
                          {!isPrimary && (
                            <DetachButton tenderId={m.t.id} title={m.t.titleOriginal} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white py-14 text-center text-neutral-500">
          Henüz hakem kararı yok — benzerliği ≥ 0.85 olan çift çıktığında LLM hakem devreye girer.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>İhale A</TableHead>
                <TableHead>İhale B</TableHead>
                <TableHead className="text-right">Benzerlik</TableHead>
                <TableHead>Hakem</TableHead>
                <TableHead>Karar</TableHead>
                <TableHead>Gerekçe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[200px]">
                    <Link href={`/admin/tenders/${c.tenderAId}`} className="line-clamp-2 text-xs hover:underline">
                      {titleById.get(c.tenderAId) ?? c.tenderAId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <Link href={`/admin/tenders/${c.tenderBId}`} className="line-clamp-2 text-xs hover:underline">
                      {titleById.get(c.tenderBId) ?? c.tenderBId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-sm">{c.similarity.toFixed(3)}</TableCell>
                  <TableCell className="text-sm">{c.verdict ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {STATUS_TR[c.status] ?? c.status}
                  </TableCell>
                  <TableCell className="max-w-[260px] text-xs text-neutral-500">{c.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
