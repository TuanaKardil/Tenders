import { eq, sql } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";

export const dynamic = "force-dynamic";

/** Portal/site adı (ülke değil — aynı ülkeden birden çok kaynak olabilir). */
const SOURCE_TR: Record<string, string> = {
  "ted-eu": "TED",
  "ke-ppip": "PPIP (Kenya)",
  "et-egp": "eGP Etiyopya",
  "ug-egp": "eGP Uganda",
  ungm: "UNGM",
};

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Sütunlar = çekirdek veri alanları. */
const FIELDS: { key: string; label: string }[] = [
  { key: "title", label: "Başlık" },
  { key: "country", label: "Ülke" },
  { key: "buyer", label: "Alıcı" },
  { key: "funder", label: "Fon veren" },
  { key: "sector", label: "Sektör" },
  { key: "cpv", label: "CPV kodu" },
  { key: "noticeType", label: "İhale türü" },
  { key: "method", label: "Yöntem" },
  { key: "published", label: "Yayın tarihi" },
  { key: "closing", label: "Son teklif t." },
  { key: "qDeadline", label: "Soru son t." },
  { key: "value", label: "Bedel" },
  { key: "currency", label: "Para birimi" },
  { key: "region", label: "Bölge/şehir" },
  { key: "docs", label: "Belge (PDF)" },
  { key: "eligibility", label: "Uygunluk" },
];

function cellColor(pct: number): string {
  if (pct >= 90) return "bg-emerald-100 text-emerald-800";
  if (pct >= 50) return "bg-amber-100 text-amber-800";
  if (pct > 0) return "bg-orange-100 text-orange-800";
  return "bg-neutral-100 text-neutral-400";
}

export default async function AdminCoveragePage() {
  const rows = await db
    .select({
      slug: sources.slug,
      url: sources.url,
      total: sql<number>`cast(count(*) as int)`,
      langs: sql<string>`string_agg(distinct ${tenders.languageOriginal}, ',')`,
      title: sql<number>`cast(count(${tenders.titleOriginal}) as int)`,
      country: sql<number>`cast(count(${tenders.country}) as int)`,
      buyer: sql<number>`cast(count(${tenders.buyerNameRaw}) as int)`,
      funder: sql<number>`cast(count(${tenders.funderName}) as int)`,
      sector: sql<number>`cast(count(${tenders.sectorPrimary}) as int)`,
      cpv: sql<number>`cast(count(*) filter (where cardinality(${tenders.cpvCodes}) > 0) as int)`,
      noticeType: sql<number>`cast(count(${tenders.noticeType}) as int)`,
      method: sql<number>`cast(count(${tenders.procurementMethod}) as int)`,
      published: sql<number>`cast(count(${tenders.publishedAt}) as int)`,
      closing: sql<number>`cast(count(${tenders.closingAt}) as int)`,
      qDeadline: sql<number>`cast(count(${tenders.questionDeadline}) as int)`,
      value: sql<number>`cast(count(${tenders.valueUsdEst}) as int)`,
      currency: sql<number>`cast(count(${tenders.currency}) as int)`,
      region: sql<number>`cast(count(*) filter (where ${tenders.region} is not null or ${tenders.city} is not null) as int)`,
      docs: sql<number>`cast(count(*) filter (where ${tenders.documentsCount} > 0) as int)`,
      eligibility: sql<number>`cast(count(${tenders.eligibilityNotesEn}) as int)`,
    })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .groupBy(sources.slug, sources.url)
    .orderBy(sql`count(*) desc`);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Kaynak kapsamı</h1>
      <p className="mb-5 max-w-3xl text-sm text-neutral-500">
        Her <b>kaynak bir satır</b>, çekirdek veri alanları sütun. Hücre, o kaynağın ihalelerinin
        yüzde kaçında o alanın dolu geldiğini gösterir — yani o kaynaktan hangi bilgiyi
        bulabiliyoruz. (Gri/az olanlar AI çıkarımı veya belge/PDF okuma ile dolacak.)
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="sticky left-0 z-10 bg-white px-4 py-2 text-left font-medium text-neutral-500">
                Kaynak
              </th>
              {FIELDS.map((f) => (
                <th
                  key={f.key}
                  className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium text-neutral-500"
                >
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.slug} className="border-b border-neutral-100">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap">
                  <div className="font-semibold text-neutral-900">{SOURCE_TR[s.slug] ?? s.slug}</div>
                  <div className="text-xs text-neutral-400">{host(s.url)}</div>
                  <div className="text-xs text-neutral-400">{s.total} ihale · {s.langs}</div>
                </td>
                {FIELDS.map((f) => {
                  const count = (s as unknown as Record<string, number>)[f.key] ?? 0;
                  const pct = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
                  return (
                    <td key={f.key} className="px-2 py-1.5 text-center">
                      <span
                        className={`inline-block min-w-[2.6rem] rounded px-1.5 py-1 text-xs font-medium ${cellColor(pct)}`}
                        title={`${count}/${s.total}`}
                      >
                        %{pct}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-500">
        <span><span className="mr-1 inline-block size-3 rounded bg-emerald-100 align-middle" /> ≥%90 var</span>
        <span><span className="mr-1 inline-block size-3 rounded bg-amber-100 align-middle" /> %50–89</span>
        <span><span className="mr-1 inline-block size-3 rounded bg-orange-100 align-middle" /> %1–49</span>
        <span><span className="mr-1 inline-block size-3 rounded bg-neutral-100 align-middle" /> yok (%0)</span>
      </div>
    </div>
  );
}
