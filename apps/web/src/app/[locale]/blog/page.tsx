import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BLOG_POSTS } from "@/lib/blog";
import { alternatesFor, SEO_LIVE } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Blog",
    alternates: alternatesFor("/blog", locale),
    robots: SEO_LIVE ? undefined : { index: false, follow: true },
  };
}

export default async function BlogIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const fmt = new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium" });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Blog</h1>
      <div className="mt-8 space-y-4">
        {BLOG_POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block rounded-xl border border-neutral-200 p-5 transition-colors hover:bg-neutral-50"
          >
            <div className="text-xs text-neutral-400">{fmt.format(new Date(post.date))}</div>
            <h2 className="mt-1 text-lg font-semibold text-neutral-900">{post.title}</h2>
            <p className="mt-1 text-sm text-neutral-600">{post.excerpt}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
