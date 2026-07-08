// Server-side instrumentation — runs once when a Next.js server instance boots.
// Initialises Sentry for the Node runtime and bridges the application logger to
// it, so every server-side logger.error() reaches Sentry (the single choke
// point). Errors only: tracesSampleRate 0 keeps this on the free tier.
//
// Gated on NODE_ENV=production so local `next dev` never ships events even when
// the DSN is present in .env.local. (The recorder worker is not "production" but
// IS the live machine, so it initialises Sentry unconditionally in its own entry
// point — see local-runner/worker.ts.)
import type { Instrumentation } from "next";

const dsn = () => process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const enabled = () => Boolean(dsn()) && process.env.NODE_ENV === "production";

export async function register() {
  // Sentry's Node SDK only makes sense on the Node.js runtime; skip edge/others.
  if (process.env.NEXT_RUNTIME !== "nodejs" || !enabled()) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: dsn(),
    tracesSampleRate: 0,
  });

  const { wireLoggerToSentry } = await import("@/lib/sentry-reporter");
  wireLoggerToSentry(Sentry);
}

// Next calls this for uncaught server errors (Server Components, route handlers,
// middleware). Forwards them to Sentry with full request context.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!enabled()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
