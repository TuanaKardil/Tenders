"use client";

import { useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface QaCitation {
  document: string;
  page?: number;
}
interface QaMessage {
  role: "user" | "assistant";
  text: string;
  status?: string;
  citations?: QaCitation[];
}

export interface TenderAssistantLabels {
  title: string;
  intro: string;
  placeholder: string;
  send: string;
  signInCta: string;
  signInButton: string;
  error: string;
  rateLimited: string;
  quotaHit: string;
  quotaUpgrade: string;
  unavailable: string;
  suggested: string[];
}

/**
 * AI assistant on the tender detail page — asks about THIS tender only.
 * Signed-out users see the box but get a sign-in CTA (scrape protection).
 */
export function TenderAssistant({
  tenderId,
  labels,
}: {
  tenderId: string;
  labels: TenderAssistantLabels;
}) {
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | "generic" | "rate" | "quota" | "unavailable">(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as {
        answer?: string;
        status?: string;
        citations?: QaCitation[];
        error?: string;
      };
      if (res.status === 429) {
        setError(data.error === "rate_limited" ? "rate" : "quota");
        setMessages((m) => m.slice(0, -1));
        setInput(q);
        return;
      }
      if (res.status === 503) {
        setError("unavailable");
        setMessages((m) => m.slice(0, -1));
        setInput(q);
        return;
      }
      if (!res.ok || !data.answer) throw new Error(data.error ?? "failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer!, status: data.status, citations: data.citations },
      ]);
    } catch {
      setError("generic");
      setMessages((m) => m.slice(0, -1)); // drop the unanswered question
      setInput(q); // let the user retry
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{labels.title}</h2>
      <div className="rounded-xl border border-neutral-200 p-5">
        <SignedOut>
          <p className="mb-3 text-sm text-neutral-600">{labels.signInCta}</p>
          <SignInButton mode="modal">
            <Button size="sm">{labels.signInButton}</Button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <p className="mb-3 text-sm text-neutral-500">{labels.intro}</p>

          {messages.length === 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {labels.suggested.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.length > 0 && (
            <div className="mb-3 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div
                    className={
                      m.role === "user"
                        ? "inline-block rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
                        : "inline-block whitespace-pre-wrap rounded-lg bg-neutral-100 px-3 py-2 text-left text-sm text-neutral-900"
                    }
                  >
                    {m.text}
                  </div>
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.citations.map((c, j) => (
                        <Badge key={j} variant="secondary" className="text-[10px]">
                          📄 {c.document}
                          {c.page ? ` · s.${c.page}` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="inline-block animate-pulse rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-400">
                  ···
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {error === "rate" && labels.rateLimited}
              {error === "unavailable" && labels.unavailable}
              {error === "generic" && labels.error}
              {error === "quota" && (
                <>
                  {labels.quotaHit}{" "}
                  <Link href="/pricing" className="font-medium underline">
                    {labels.quotaUpgrade}
                  </Link>
                </>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder={labels.placeholder}
              className="h-9 flex-1 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-500"
            />
            <Button type="submit" size="sm" disabled={loading || !input.trim()}>
              {labels.send}
            </Button>
          </form>
        </SignedIn>
      </div>
    </section>
  );
}
