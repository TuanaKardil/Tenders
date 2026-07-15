"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/** Env-gated analytics. With no key set, renders children untouched (dormant). */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (KEY && !posthog.__loaded) {
      posthog.init(KEY, { api_host: HOST, capture_pageview: false });
    }
  }, []);

  useEffect(() => {
    if (KEY) posthog.capture("$pageview");
  }, [pathname]);

  if (!KEY) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
