import { eq, sql } from "drizzle-orm";
import { db, tenders, sources } from "@repo/db";
import { DETAIL_FETCH_SOURCES } from "@repo/config/source-contract";
import { Link } from "@/i18n/navigation";

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

/** Critical fields tracked in tenders.field_provenance. */
const PROV_FIELDS: { key: string; label: string }[] = [
  { key: "closing_at", label: "Son teklif t." },
  { key: "published_at", label: "Yayın t." },
  { key: "estimated_value", label: "Bedel" },
  { key: "currency", label: "Para birimi" },
  { key: "buyer", label: "Alıcı" },
  { key: "eligibility", label: "Uygunluk" },
  { key: "notice_type", label: "İhale türü" },
];

const ORIGIN_TR: Record<string, string> = {
  source_page: "sayfa",
  document: "belge",
  ai_page_text: "metin",
  manual: "elle",
};

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

  // Provenance matrix rows — fill% + dominant origin per critical field,
  // produced entirely from tenders.field_provenance (no manual input).
  const provCol = (k: string) => ({
    [`${k}_n`]: sql<number>`cast(count(*) filter (where ${tenders.fieldProvenance} ? ${k}) as int)`,
    [`${k}_o`]: sql<string | null>`mode() within group (order by ${tenders.fieldProvenance}->>${k})`,
  });
  const provRows = await db
    .select({
      slug: sources.slug,
      total: sql<number>`cast(count(*) as int)`,
      ...provCol("closing_at"),
      ...provCol("published_at"),
      ...provCol("estimated_value"),
      ...provCol("currency"),
      ...provCol("buyer"),
      ...provCol("eligibility"),
      ...provCol("notice_type"),
    })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .groupBy(sources.slug)
    .orderBy(sql`count(*) desc`);

  // 6a — detail-fetch sources with documents_count = 0 (we looked, found none).
  const zeroDocsBySource: Record<string, { count: number; samples: { id: string; title: string }[] }> = {};
  if (DETAIL_FETCH_SOURCES.length > 0) {
    for (const slug of DETAIL_FETCH_SOURCES) {
      const [{ n }] = await db
        .select({ n: sql<number>`cast(count(*) as int)` })
        .from(tenders)
        .innerJoin(sources, eq(tenders.sourceId, sources.id))
        .where(sql`${sources.slug} = ${slug} and ${tenders.documentsCount} = 0`);
      const samples = await db
        .select({ id: tenders.id, title: tenders.titleOriginal })
        .from(tenders)
        .innerJoin(sources, eq(tenders.sourceId, sources.id))
        .where(sql`${sources.slug} = ${slug} and ${tenders.documentsCount} = 0`)
        .orderBy(sql`${tenders.firstSeenAt} desc`)
        .limit(10);
      if (n > 0) zeroDocsBySource[slug] = { count: n, samples };
    }
  }

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
            {rows.map((s) => {
              // Source-health signal: document coverage below 20% usually means
              // the scraper skips the detail page (the "Guinea mistake").
              const docPct = s.total > 0 ? Math.round((s.docs / s.total) * 100) : 0;
              const lowDocs = docPct < 20;
              return (
              <tr key={s.slug} className="border-b border-neutral-100">
                <td
                  className={`sticky left-0 z-10 px-4 py-2 whitespace-nowrap ${lowDocs ? "bg-amber-50" : "bg-white"}`}
                  title={lowDocs ? `Belge kapsama %${docPct} — detay sayfası çekimi eksik olabilir` : undefined}
                >
                  <div className="font-semibold text-neutral-900">
                    {SOURCE_TR[s.slug] ?? s.slug}
                    {lowDocs && <span className="ml-1 text-amber-600">⚠</span>}
                  </div>
                  <div className="text-xs text-neutral-400">{host(s.url)}</div>
                  <div className="text-xs text-neutral-400">{s.total} ihale · {s.langs}</div>
                  {lowDocs && (
                    <div className="text-xs font-medium text-amber-700">belge kapsama %{docPct}</div>
                  )}
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
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-500">
        <span><span className="mr-1 inline-block size-3 rounded bg-emerald-100 align-middle" /> ≥%90 var</span>
        <span><span className="mr-1 inline-block size-3 rounded bg-amber-100 align-middle" /> %50–89</span>
        <span><span className="mr-1 inline-block size-3 rounded bg-orange-100 align-middle" /> %1–49</span>
        <span><span className="mr-1 inline-block size-3 rounded bg-neutral-100 align-middle" /> yok (%0)</span>
      </div>

      {/* Provenance matrix — where each critical field's value comes from */}
      <h2 className="mb-1 mt-10 text-lg font-semibold">Alan kökeni (field_provenance)</h2>
      <p className="mb-4 max-w-3xl text-sm text-neutral-500">
        Kritik alanların değeri nereden geliyor: <b>sayfa</b> = kaynağın yapılandırılmış verisi,{" "}
        <b>belge</b> = ekli PDF/Word&apos;den AI çıkarımı, <b>metin</b> = sayfa metninden AI. Hücre:
        doluluk yüzdesi + baskın köken.
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="px-4 py-2 text-left font-medium text-neutral-500">Kaynak</th>
              {PROV_FIELDS.map((f) => (
                <th key={f.key} className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium text-neutral-500">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {provRows.map((s) => (
              <tr key={s.slug} className="border-b border-neutral-100">
                <td className="whitespace-nowrap px-4 py-2 font-semibold">{SOURCE_TR[s.slug] ?? s.slug}</td>
                {PROV_FIELDS.map((f) => {
                  const filled = (s as unknown as Record<string, number>)[`${f.key}_n`] ?? 0;
                  const origin = (s as unknown as Record<string, string | null>)[`${f.key}_o`];
                  const pct = s.total > 0 ? Math.round((filled / s.total) * 100) : 0;
                  return (
                    <td key={f.key} className="px-2 py-1.5 text-center">
                      <span className={`inline-block min-w-[3.4rem] rounded px-1.5 py-1 text-xs font-medium ${cellColor(pct)}`}>
                        %{pct}
                        <span className="block text-[10px] font-normal opacity-75">
                          {origin ? ORIGIN_TR[origin] ?? origin : "—"}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 6a — document suspicion: detail fetched, still no documents */}
      <h2 className="mb-1 mt-10 text-lg font-semibold">Belge şüphesi — detay çekildi, belge yok</h2>
      <p className="mb-4 max-w-3xl text-sm text-neutral-500">
        Detay sayfası çekilen kaynaklarda (<code className="rounded bg-neutral-100 px-1">requiresDetailFetch</code>){" "}
        belge sayısı 0 olan ihaleler. Bunlar &quot;belge yok&quot; değil, &quot;baktık ama bulamadık&quot; olabilir —
        seçici kırılmış olabilir. Detay çekilmeyen kaynaklar (UNGM/Uganda/Etiyopya) burada gösterilmez.
      </p>
      {Object.keys(zeroDocsBySource).length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Detay çekilen kaynaklarda belgesiz ihale yok.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(zeroDocsBySource).map(([slug, data]) => (
            <div key={slug} className="rounded-lg border border-amber-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold">
                {SOURCE_TR[slug] ?? slug} · <span className="text-amber-700">{data.count} belgesiz ihale</span>
              </div>
              <ul className="space-y-1 text-xs">
                {data.samples.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/tenders/${t.id}`} className="text-neutral-700 hover:underline">
                      {t.title.slice(0, 90)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
