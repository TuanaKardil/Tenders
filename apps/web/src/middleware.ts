import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  "/(en|tr)/dashboard(.*)",
  "/dashboard(.*)",
  "/(en|tr)/watchlist(.*)",
  "/watchlist(.*)",
  "/(en|tr)/alerts(.*)",
  "/alerts(.*)",
  "/(en|tr)/onboarding(.*)",
  "/onboarding(.*)",
  "/(en|tr)/admin(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  // API routes matched here (e.g. tender QA) only need the Clerk context —
  // locale routing must not touch them.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return;
  }
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // Skip Next internals, static files, /api, and metadata image routes
    // (opengraph/twitter/icon), which must not be locale-redirected.
    "/((?!api|go|_next|_vercel|.*opengraph-image|.*twitter-image|.*icon|.*\\..*).*)",
    // API routes that read the Clerk session must run through clerkMiddleware
    // (they skip intl above). auth() in the handler decides 401 — no redirect.
    "/api/tenders/(.*)/qa",
  ],
};
