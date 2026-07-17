import { desc, eq, sql } from "drizzle-orm";
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

const LANG_TR: Record<string, string> = {
  en: "İngilizce",
  fr: "Fransızca",
  pt: "Portekizce",
  ar: "Arapça",
  es: "İspanyolca",
  tr: "Türkçe",
};

function shortDate(d: Date | null): string {
  return d
    ? d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";
}

export default async function AdminTendersPage() {
  const rows = await db
    .select({ t: tenders, sourceSlug: sources.slug })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .orderBy(desc(tenders.firstSeenAt))
    .limit(200);

  // Kaynak başına toplam (özet şerit)
  const perSource = await db
    .select({ slug: sources.slug, n: sql<number>`count(*)::int` })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .groupBy(sources.slug)
    .orderBy(sql`count(*) desc`);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">İhaleler — kaynaktan gelen ham veri</h1>
        <span className="text-sm text-neutral-500">son {rows.length} ihale</span>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Her satır, ihalenin kaynağından geldiği <b>ham/orijinal</b> haliyle gösterilir (AI çevirisi/özeti öncesi).
      </p>

      {/* Kaynak başına toplam */}
      <div className="mb-5 flex flex-wrap gap-2">
        {perSource.map((s) => (
          <span
            key={s.slug}
            className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700"
          >
            {s.slug} · <b>{s.n}</b>
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>İhale (orijinal başlık)</TableHead>
              <TableHead>Kaynak</TableHead>
              <TableHead>Orijinal dil</TableHead>
              <TableHead>Ülke</TableHead>
              <TableHead>Kaynak referans no</TableHead>
              <TableHead>Alıcı (ham)</TableHead>
              <TableHead>Son teklif tarihi</TableHead>
              <TableHead>Belge</TableHead>
              <TableHead>Çekilme</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-neutral-500">
                  Henüz ihale yok.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ t, sourceSlug }) => (
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
                <TableCell className="whitespace-nowrap text-sm">
                  {LANG_TR[t.languageOriginal] ?? t.languageOriginal.toUpperCase()}
                </TableCell>
                <TableCell>{t.country}</TableCell>
                <TableCell className="max-w-[160px] truncate font-mono text-xs text-neutral-500">
                  {t.sourceNoticeId}
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-xs text-neutral-600">
                  {t.buyerNameRaw ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">{shortDate(t.closingAt)}</TableCell>
                <TableCell className="text-center text-sm">{t.documentsCount}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-neutral-500">
                  {shortDate(t.firstSeenAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
