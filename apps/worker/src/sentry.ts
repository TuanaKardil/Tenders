import * as Sentry from "@sentry/node";

// Dormant unless SENTRY_DSN is set.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

export { Sentry };
