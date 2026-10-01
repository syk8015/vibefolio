import { NextResponse } from "next/server";
import { logger } from "./logger";

// Standard shape for every JSON API failure response:
//   { ok: false, error: <user-safe message>, code?: <ERR_CODE>, field?: <payload path> }
//
// The real cause (stack trace, raw DB message, etc.) is logged server-side via
// `logger` and is NEVER serialised into the response body — clients only ever
// receive the friendly `message` (and an optional stable `code`).
export interface ApiErrorOptions {
  /** HTTP status to return. */
  status: number;
  /** User-friendly message, safe to surface in the UI. */
  message: string;
  /** Stable machine-readable code, e.g. "FORBIDDEN", "INTERNAL". */
  code?: string;
  /**
   * The request field the rejection is about, as a path into the JSON body —
   * `description`, `demoAccess.note`, `demoScript.steps[2].caption.en` (0-based
   * indexes). 외부 AI 피드백 NF-11(2026-10-02): 문장만으로는 AI가 어느 칸을 고칠지
   * 다시 읽어 짐작해야 했다 — 기계가 바로 짚게 경로를 따로 싣는다.
   */
  field?: string;
  /** The underlying error — logged server-side, never returned to the client. */
  cause?: unknown;
  /** Extra structured fields for the server log. */
  context?: Record<string, unknown>;
  /** Force logging on/off. Defaults to true for 5xx or whenever a cause exists. */
  log?: boolean;
}

export interface ApiErrorBody {
  ok: false;
  error: string;
  code?: string;
  field?: string;
}

export function apiError({
  status,
  message,
  code,
  field,
  cause,
  context,
  log,
}: ApiErrorOptions): NextResponse<ApiErrorBody> {
  const shouldLog = log ?? (status >= 500 || cause !== undefined);
  if (shouldLog) {
    logger.error(`API ${status}${code ? ` ${code}` : ""}: ${message}`, {
      error: cause,
      status,
      code,
      ...context,
    });
  }
  return NextResponse.json(
    { ok: false as const, error: message, ...(code ? { code } : {}), ...(field ? { field } : {}) },
    { status },
  );
}
