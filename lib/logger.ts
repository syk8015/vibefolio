// Structured, isomorphic application logger.
//
// One choke-point for every server- and client-side log, so the output format
// stays consistent and a future Sentry / Datadog integration only has to be
// wired in at `dispatch()` below — individual call sites never change.
//
// Design notes:
//  - Stack traces are attached on the SERVER ONLY. Internal file paths / source
//    frames must never reach the browser console (information leak).
//  - In production every entry is emitted as a single JSON line so log
//    aggregators can parse it; in development it is pretty-printed for humans.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown> & { error?: unknown };

// An error-level log forwarded to an external reporter (e.g. Sentry). It carries
// the ORIGINAL thrown value — not the serialised shape dispatch() logs — so the
// reporter keeps the real Error instance for accurate stack traces and grouping.
export interface ErrorReport {
  message: string;
  error?: unknown;
  context: Record<string, unknown>;
}

type ErrorReporter = (report: ErrorReport) => void;

const isServer = typeof window === "undefined";
const isProduction = process.env.NODE_ENV === "production";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  runtime: "server" | "client";
  [key: string]: unknown;
}

// Turn an unknown thrown value into a plain, serialisable shape. The stack is
// included only on the server.
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(isServer && error.stack ? { stack: error.stack } : {}),
    };
  }
  // Plain error-shaped objects, e.g. Supabase's PostgrestError
  // ({ message, code, details, hint }) — capture the useful fields.
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string") {
      return {
        message: obj.message,
        ...(typeof obj.code === "string" ? { code: obj.code } : {}),
        ...(obj.details !== undefined ? { details: obj.details } : {}),
        ...(obj.hint !== undefined ? { hint: obj.hint } : {}),
      };
    }
  }
  return { value: typeof error === "string" ? error : String(error) };
}

function buildEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  const { error, ...rest } = context ?? {};
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    runtime: isServer ? "server" : "client",
    ...(error !== undefined ? { error: serializeError(error) } : {}),
    ...rest,
  };
}

// The single emit point. Extend this to forward to an external service (e.g.
// Sentry.captureException using entry.level / entry.error) without touching any
// call site.
function dispatch(entry: LogEntry): void {
  const sink =
    entry.level === "error"
      ? console.error
      : entry.level === "warn"
        ? console.warn
        : entry.level === "debug"
          ? console.debug
          : console.log;

  if (isProduction) {
    sink(JSON.stringify(entry));
  } else {
    const { level, message, timestamp, runtime, ...rest } = entry;
    sink(
      `[${timestamp}] ${level.toUpperCase()} (${runtime}) ${message}`,
      Object.keys(rest).length ? rest : "",
    );
  }
}

// Optional external sink for error-level logs, registered once at process start
// (instrumentation.ts on the server, instrumentation-client.ts in the browser,
// the recorder worker's entry point). Keeping it here means the many
// logger.error() call sites never import Sentry directly — this stays the single
// choke point the whole app funnels through.
//
// ⚠️ Stored on globalThis, NOT module scope. On Vercel the instrumentation
// bundle and each route bundle can hold their OWN copy of this module, so a
// module-scoped variable wired by instrumentation.ts is invisible to routes
// (observed in prod: reporterWired:false while register() had run — every
// logger.error capture silently dropped). The Sentry SDK survives the same
// split because it keeps its client on a global carrier; do the same here.
const REPORTER_KEY = "__nookframeErrorReporter" as const;
type GlobalWithReporter = typeof globalThis & {
  [REPORTER_KEY]?: ErrorReporter | null;
};

export function setErrorReporter(reporter: ErrorReporter | null): void {
  (globalThis as GlobalWithReporter)[REPORTER_KEY] = reporter;
}

function getErrorReporter(): ErrorReporter | null {
  return (globalThis as GlobalWithReporter)[REPORTER_KEY] ?? null;
}

// Diagnostic: is an external reporter (Sentry) actually wired in this runtime?
// Surfaced by the protected /api/cron/health response so a broken instrumentation
// path is visible from outside instead of failing silently.
export function hasErrorReporter(): boolean {
  return getErrorReporter() !== null;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  // Drop debug noise in production.
  if (level === "debug" && isProduction) return;
  dispatch(buildEntry(level, message, context));

  // Forward errors to the external reporter with the raw thrown value intact.
  const reporter = level === "error" ? getErrorReporter() : null;
  if (reporter) {
    const { error, ...rest } = context ?? {};
    try {
      reporter({ message, error, context: rest });
    } catch {
      // A reporter failure must never break the code path that logged.
    }
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
};

export type Logger = typeof logger;
