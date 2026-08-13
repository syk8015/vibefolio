// Demo failure code protocol.
//
// Producers (local worker, health-cron reaper) store a classified failure as
// `[code] human message` in projects.demo_build_error; the dashboard parses it
// back to show per-cause copy with the raw message behind a toggle. Rows written
// before this protocol (or by ad-hoc client writes) have no prefix — parse falls
// back to code null and the raw text is preserved.
//
// Client-safe: no server-only imports (used by ProjectsTab, the tsx worker and
// API routes alike).
import { getDictionary } from "./i18n/dictionaries";
import type { Locale } from "./i18n/config";

export const DEMO_FAILURE_CODES = [
  "login-gated", // site needs auth — recorder only shoots public screens
  "timeout", // job hit the worker's hard timeout
  "interrupted", // worker restarted mid-job (startup recovery)
  "stuck", // health-cron reaped a row stuck in-flight
  "build-failed", // github/zip build broke (clone/install/dev server)
  "not-a-webapp", // nothing serveable — no web page, or backend-only repo
  "blank", // page loaded but rendered nothing (empty/placeholder)
  "policy", // admin rejected a moderation-held take (content policy)
  "error", // anything else (raw pipeline message follows)
] as const;

export type DemoFailureCode = (typeof DEMO_FAILURE_CODES)[number];

export function formatDemoFailure(code: DemoFailureCode, message: string): string {
  return `[${code}] ${message}`;
}

export function parseDemoFailure(stored: string | null): {
  code: DemoFailureCode | null;
  message: string;
} {
  if (!stored) return { code: null, message: "" };
  const m = stored.match(/^\[([a-z-]+)\]\s*/);
  if (m && (DEMO_FAILURE_CODES as readonly string[]).includes(m[1])) {
    return { code: m[1] as DemoFailureCode, message: stored.slice(m[0].length) };
  }
  return { code: null, message: stored };
}

// 실패 코드별 카피 — 유저가 "왜 실패했고 뭘 하면 되는지"를 raw 에러 없이 알 수 있게.
// 대시보드 배지 팝오버와 실패 알림 이메일이 같은 표를 읽어 두 표면이 어긋나지 않는다.
// raw 메시지는 대시보드 팝오버의 "기술 정보" 토글 뒤로만 (이메일에는 안 싣는다).
// 코드 없는(구형/클라이언트 기록) 행은 error 카피로 폴백.
//
// 표 본문은 i18n 사전의 demoFailure 네임스페이스로 이관됨(ko/en). 클라이언트는
// useT()로 t.demoFailure[code]를 직접 읽고, 서버/워커는 이 헬퍼로 locale을 넘긴다.
export function demoFailureCopy(
  code: DemoFailureCode | null,
  locale: Locale,
): { title: string; body: string } {
  return getDictionary(locale).demoFailure[code ?? "error"];
}
