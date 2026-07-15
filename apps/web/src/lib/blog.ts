/**
 * Minimal blog content source. Skeleton — swap for MDX files or a CMS later.
 * Posts are sample/placeholder content and stay noindex until real posts exist.
 */
export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  author: string;
  paragraphs: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-win-your-first-tender",
    title: "How to win your first public tender",
    excerpt:
      "A practical, five-step walkthrough for first-time bidders — from finding the right notice to submitting a compliant offer.",
    date: "2026-07-01",
    author: "Tenderlist",
    paragraphs: [
      "Winning your first public tender feels daunting, but the process is more predictable than it looks. The single biggest mistake first-time bidders make is starting too late — the best time to prepare is before the notice you want even appears.",
      "Start by narrowing your focus. Pick the sectors and countries where you can genuinely deliver, set an alert, and let new opportunities come to you instead of hunting for them manually.",
      "When a relevant notice lands, read the original document in full — including every annex. Confirm you meet the eligibility criteria before investing time, and prepare the required documents well ahead of the deadline.",
      "Finally, submit through the exact channel the notice specifies, before the stated closing time. A technically strong offer that misses the submission rules is still a losing offer.",
    ],
  },
  {
    slug: "reading-a-tender-notice",
    title: "How to read a tender notice like a pro",
    excerpt:
      "The key fields every procurement notice contains, and what they really mean for your bid decision.",
    date: "2026-06-20",
    author: "Tenderlist",
    paragraphs: [
      "Every tender notice, no matter the country or buyer, shares a common backbone: who is buying, what they need, how much it's worth, and by when you must respond.",
      "The closing date and question deadline are the two dates that matter most. Miss the first and you can't bid; miss the second and you lose your chance to clarify ambiguous requirements.",
      "Estimated value and procurement method tell you how competitive the process will be and how formal your response must be. Eligibility criteria tell you whether it's worth bidding at all.",
      "When in doubt, always rely on the original official notice for binding details — aggregators like Tenderlist help you find and track opportunities, but the source document governs.",
    ],
  },
];

export function getPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}
