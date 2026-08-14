// Nookframe Connect — demoAccess (업로드 개선 요청2): 로그인해야 보이는 앱을 시연
// 로봇이 볼 수 있게, 만든 사람이 주는 "데모 모드 진입 정보". 받는 키는 url(데모/
// 게스트 진입 URL 또는 경로)·params(추가 쿼리 파라미터)·note(시나리오 노트) 셋뿐
// — 계정/비번 평문 저장은 설계상 범위 밖.
//
// 인제스트(/api/ingest)는 저장만 한다(projects.demo_access, 가드 트리거 밖의 유저
// 콘텐츠 컬럼). 사용은 발행 시점 쿠키 인증 trigger-demo(절대 URL 재검증 게이트) →
// 로컬 워커(진입 URL 조립 + explore 브리핑 주입)가 유일 경로다. 세 지점이 같은
// 정규화를 쓰도록 여기 한 곳에 둔다.

export type DemoAccess = {
  url?: string;
  params?: Record<string, string>;
  note?: string;
};

export const DEMO_ACCESS_URL_MAX = 500;
export const DEMO_ACCESS_NOTE_MAX = 500;
const PARAMS_MAX_ENTRIES = 12;
const PARAMS_KV_MAX = 120;

// Shape-only 정규화(네트워크 없음): unknown → 저장 가능한 DemoAccess | null.
// url이 http(s)도 "/"경로도 아니면 issue로 알린다 — 조용히 버리면 발행 후 시연이
// 이유 없이 로그인 화면을 찍게 되므로, 라우트가 locale 카피로 400을 돌려준다.
// 절대 URL의 콘텐츠호스트·사설망·SSRF 게이트는 라우트 몫(ingest·trigger-demo).
export function normalizeDemoAccess(
  v: unknown,
): { access: DemoAccess | null; issue?: "bad-url" } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { access: null };
  const raw = v as { url?: unknown; params?: unknown; note?: unknown };
  const access: DemoAccess = {};

  if (typeof raw.url === "string" && raw.url.trim()) {
    const url = raw.url.trim().slice(0, DEMO_ACCESS_URL_MAX);
    const isPath = url.startsWith("/");
    const isHttp = /^https?:\/\//i.test(url);
    if (!isPath && !isHttp) return { access: null, issue: "bad-url" };
    if (isHttp) {
      try {
        new URL(url);
      } catch {
        return { access: null, issue: "bad-url" };
      }
    }
    access.url = url;
  }

  if (raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)) {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(raw.params as Record<string, unknown>).slice(
      0,
      PARAMS_MAX_ENTRIES,
    )) {
      if (!k.trim()) continue;
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        out[k.trim().slice(0, PARAMS_KV_MAX)] = String(val).slice(0, PARAMS_KV_MAX);
      }
    }
    if (Object.keys(out).length) access.params = out;
  }

  if (typeof raw.note === "string" && raw.note.trim()) {
    access.note = raw.note.trim().slice(0, DEMO_ACCESS_NOTE_MAX);
  }

  return { access: Object.keys(access).length ? access : null };
}
