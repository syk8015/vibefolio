// Bridges the application logger to Sentry. Call once per runtime, right after
// Sentry.init — from instrumentation.ts (server), instrumentation-client.ts
// (browser) and the local recorder worker. After this, every logger.error()
// lights up Sentry without any call site importing the SDK.
//
// Sentry is passed in rather than imported so this module is runtime-neutral: the
// server hands it the Node build, the browser hands it the client build, and this
// file drags neither into the wrong bundle.
import { setErrorReporter, type ErrorReport } from "@/lib/logger";

interface CaptureContext {
  level?: "error";
  extra?: Record<string, unknown>;
}

// Structural subset of the Sentry SDK we depend on — avoids importing @sentry
// types (and thus a build) into this shared, runtime-neutral module.
interface SentryLike {
  captureException(exception: unknown, hint?: CaptureContext): unknown;
  captureMessage(message: string, hint?: CaptureContext): unknown;
}

export function wireLoggerToSentry(
  Sentry: SentryLike,
  opts?: {
    // Runs right after each capture. The serverless entry point uses this to
    // schedule a transport flush past the response (next/server `after`) —
    // without it Vercel freezes the function on response end and the buffered
    // event dies with it (observed: prod watchdog alerts never reached Sentry).
    // Browser and worker runtimes don't need it: the browser transport sends
    // immediately and the worker process is long-lived.
    afterCapture?: () => void;
  },
): void {
  setErrorReporter(({ message, error, context }: ErrorReport) => {
    const extra = { logMessage: message, ...context };
    if (error !== undefined) {
      Sentry.captureException(error, { extra });
    } else {
      // No throwable attached — record the message so silent error logs still alert.
      Sentry.captureMessage(message, { level: "error", extra });
    }
    opts?.afterCapture?.();
  });
}
