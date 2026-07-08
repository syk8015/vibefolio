// Browser instrumentation — runs after the document loads, before hydration.
// Initialises Sentry for the client and bridges the logger, so client-side
// logger.error() (including the error.tsx / global-error.tsx boundaries) reaches
// Sentry. Errors only, and gated on production like the server so local dev stays
// quiet even with a DSN present.
import * as Sentry from "@sentry/nextjs";
import { wireLoggerToSentry } from "@/lib/sentry-reporter";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
  });
  wireLoggerToSentry(Sentry);
}

// Feeds client-side navigation into Sentry's tracing/breadcrumbs. Safe to export
// unconditionally: it no-ops when Sentry was not initialised above.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
