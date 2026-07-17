import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, tenders, sources, documents as documentsTable } from "@repo/db";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Val = string | number | boolean | null | undefined | string[];

function fmt(v: Val): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function Field({ label, value, mono }: { label: string; value: Val; mono?: boolean }) {
  const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-44 shrink-0 text-neutral-500">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words ${empty ? "text-neutral-300" : "text-neutral-900"} ${mono ? "font-mono text-xs" : ""}`}>
        {fmt(value)}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-2 text-sm font-semibold text-neutral-900">{title}</h2>
      <dl className="divide-y divide-neutral-100">{children}</dl>
    </section>
  );
}

function iso(d: Date | null): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 16) : "—";
}

export default async function AdminTenderDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [row] = await db
    .select({ t: tenders, source: sources })
    .from(tenders)
    .innerJoin(sources, eq(tenders.sourceId, sources.id))
    .where(eq(tenders.id, slug))
    .limit(1);
  if (!row) notFound();
  const { t, source } = row;

  const docs = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.tenderId, t.id));

  const conf = t.extractionConfidence;
  const lowConf = (conf ?? 1) < 0.7;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/tenders" className="text-sm text-neutral-500 hover:underline">
            ← Tenders
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-neutral-900">
            {t.titleEn ?? t.titleOriginal}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={t.isPublished ? "default" : "outline"}>
            {t.isPublished ? "published" : "not published"}
          </Badge>
          {lowConf && <Badge variant="destructive">review</Badge>}
          <a
            href={`/go/${t.id}`}
            target="_blank"
            rel="noopener"
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50"
          >
            source ↗
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Scores & lifecycle">
          <Field label="extraction_confidence" value={conf === null ? null : `${Math.round((conf ?? 0) * 100)}%`} />
          <Field label="quality_score" value={t.qualityScore === null ? null : `${Math.round((t.qualityScore ?? 0) * 100)}%`} />
          <Field label="status" value={t.status} />
          <Field label="is_published" value={t.isPublished} />
          <Field label="dedupe_cluster_id" value={t.dedupeClusterId} mono />
        </Section>

        <Section title="Source identity">
          <Field label="source" value={source.name} />
          <Field label="source_notice_id" value={t.sourceNoticeId} mono />
          <Field label="source_url" value={t.sourceUrl} mono />
          <Field label="source_hash" value={t.sourceHash} mono />
          <Field label="slug" value={t.slug} mono />
        </Section>

        <Section title="Titles & summaries">
          <Field label="language_original" value={t.languageOriginal} />
          <Field label="title_original" value={t.titleOriginal} />
          <Field label="title_en" value={t.titleEn} />
          <Field label="title_tr" value={t.titleTr} />
          <Field label="summary_en" value={t.summaryEn} />
          <Field label="summary_tr" value={t.summaryTr} />
        </Section>

        <Section title="Classification">
          <Field label="sector_primary" value={t.sectorPrimary} />
          <Field label="sectors_secondary" value={t.sectorsSecondary} />
          <Field label="cpv_codes" value={t.cpvCodes} />
          <Field label="unspsc_codes" value={t.unspscCodes} />
          <Field label="keywords" value={t.keywords} />
          <Field label="notice_type" value={t.noticeType} />
          <Field label="procurement_method" value={t.procurementMethod} />
          <Field label="contract_type" value={t.contractType} />
        </Section>

        <Section title="Geography & parties">
          <Field label="country" value={t.country} />
          <Field label="region" value={t.region} />
          <Field label="city" value={t.city} />
          <Field label="buyer_name_raw" value={t.buyerNameRaw} />
          <Field label="funder_name" value={t.funderName} />
        </Section>

        <Section title="Dates">
          <Field label="published_at" value={iso(t.publishedAt)} />
          <Field label="closing_at" value={iso(t.closingAt)} />
          <Field label="question_deadline" value={iso(t.questionDeadline)} />
          <Field label="first_seen_at" value={iso(t.firstSeenAt)} />
          <Field label="last_seen_at" value={iso(t.lastSeenAt)} />
          <Field label="created_at" value={iso(t.createdAt)} />
        </Section>

        <Section title="Value">
          <Field label="estimated_value_min" value={t.estimatedValueMin} />
          <Field label="estimated_value_max" value={t.estimatedValueMax} />
          <Field label="currency" value={t.currency} />
          <Field label="value_usd_est" value={t.valueUsdEst} />
        </Section>

        <Section title="Eligibility & documents">
          <Field label="eligibility_countries" value={t.eligibilityCountries} />
          <Field label="eligibility_notes_en" value={t.eligibilityNotesEn} />
          <Field label="documents_count" value={t.documentsCount} />
          {docs.map((d) => (
            <Field key={d.id} label={d.fileType ?? "doc"} value={d.url} mono />
          ))}
        </Section>
      </div>
    </div>
  );
}
