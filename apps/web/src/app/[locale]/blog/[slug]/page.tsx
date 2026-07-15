import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getPost } from "@/lib/blog";
import { JsonLd } from "@/components/seo/json-ld";
import { alternatesFor, absoluteUrl, articleLd, SEO_LIVE } from "@/lib/seo";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: alternatesFor(`/blog/${slug}`, locale),
    robots: SEO_LIVE ? undefined : { index: false, follow: true },
    openGraph: { type: "article", title: post.title, description: post.excerpt },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  setRequestLocale(locale);
  const fmt = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium" });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <JsonLd
        data={articleLd({
          title: post.title,
          description: post.excerpt,
          url: absoluteUrl(`/blog/${slug}`),
          datePublished: post.date,
          author: post.author,
        })}
      />
      <div className="text-xs text-neutral-400">
        {fmt.format(new Date(post.date))} · {post.author}
      </div>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-neutral-900">
        {post.title}
      </h1>
      <div className="mt-6 space-y-4">
        {post.paragraphs.map((p, i) => (
          <p key={i} className="leading-relaxed text-neutral-700">
            {p}
          </p>
        ))}
      </div>
      <div className="mt-10">
        <Link href="/blog" className="text-sm text-neutral-500 underline hover:text-neutral-800">
          ← Blog
        </Link>
      </div>
    </main>
  );
}
