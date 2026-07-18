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
export const DEMO_FAILURE_CODES = [
  "login-gated", // site needs auth — recorder only shoots public screens
  "timeout", // job hit the worker's hard timeout
  "interrupted", // worker restarted mid-job (startup recovery)
  "stuck", // health-cron reaped a row stuck in-flight
  "build-failed", // github/zip build broke (clone/install/dev server)
  "not-a-webapp", // nothing serveable — no web page, or backend-only repo
  "blank", // page loaded but rendered nothing (empty/placeholder)
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
export const DEMO_FAILURE_COPY: Record<DemoFailureCode, { title: string; body: string }> = {
  "login-gated": {
    title: "로그인이 필요한 사이트예요",
    body: "지금은 로그인 없이 볼 수 있는 화면만 촬영할 수 있어요. 공개로 접속되는 URL로 바꾼 뒤 다시 시도해 주세요.",
  },
  timeout: {
    title: "촬영이 너무 오래 걸렸어요",
    body: "사이트 로딩이 느리거나 중간에 멈춘 것 같아요. 잠시 후 한 번 더 시도해 주세요.",
  },
  interrupted: {
    title: "촬영이 중간에 끊겼어요",
    body: "녹화 장비가 재시작되면서 작업이 중단됐어요. 다시 시도하면 처음부터 새로 촬영해요.",
  },
  stuck: {
    title: "생성이 오래 걸려 중단됐어요",
    body: "예상보다 오래 걸려 자동으로 멈췄어요. 한 번 더 시도해 주시고, 반복되면 사이트가 정상 접속되는지 확인해 주세요.",
  },
  "build-failed": {
    title: "프로젝트를 빌드하지 못했어요",
    body: "코드를 설치하거나 실행하는 중에 멈췄어요. 로컬에서 npm install · npm run dev가 잘 되는지 확인하거나, 빌드된 결과물(dist 폴더)이나 배포된 URL로 올려주세요.",
  },
  "not-a-webapp": {
    title: "보여줄 웹 화면을 찾지 못했어요",
    body: "웹페이지(HTML)가 없는 것 같아요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요. 웹앱이라면 index.html이 포함됐는지, 백엔드·CLI 프로젝트라면 시연 촬영 대상이 아닌지 확인해 주세요.",
  },
  blank: {
    title: "화면에 아무것도 나오지 않았어요",
    body: "페이지는 열렸는데 아직 아무것도 그려지지 않았어요. 만들다 만 빈 화면이거나 로딩이 끝나지 않은 것 같아요. 화면에 뭔가 보이는 상태로 다시 올려주세요.",
  },
  error: {
    title: "촬영 중 문제가 생겼어요",
    body: "일시적인 문제일 수 있어요. 한 번 더 시도해 보고, 반복되면 URL이 브라우저에서 정상 접속되는지 확인해 주세요.",
  },
};
