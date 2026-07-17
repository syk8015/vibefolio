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

  const { after } = await import("next/server");
  const { wireLoggerToSentry } = await import("@/lib/sentry-reporter");
  wireLoggerToSentry(Sentry, {
    // Vercel freezes the function the moment the response is done; a captured
    // event still sitting in the SDK's buffer is lost with it. `after` keeps the
    // function alive until the flush promise settles. Outside a request scope
    // (boot, background) `after` throws — fall back to a best-effort flush.
    afterCapture: () => {
      const flushed = Sentry.flush(2000).catch(() => false);
      try {
        after(flushed);
      } catch {
        // no request scope — the promise still runs, just without a keep-alive
      }
    },
  });
}

// Next calls this for uncaught server errors (Server Components, route handlers,
// middleware). Forwards them to Sentry with full request context.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!enabled()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
  // Same freeze hazard as above — Next awaits this hook, so flush inline.
  await Sentry.flush(2000).catch(() => {});
};
