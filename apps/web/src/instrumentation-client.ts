import * as Sentry from "@sentry/nextjs";

// Client-side error tracking. Dormant unless NEXT_PUBLIC_SENTRY_DSN is set.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    enabled: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
