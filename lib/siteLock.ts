// 비상 정지(2026-11-02, supabase/migration_stop_buttons.sql) — 앱 주소 쪽 게이트.
//
// middleware.ts가 /api 쓰기 요청마다 lockBlock()으로 판정한다. 읽기(GET·HEAD·OPTIONS)는 늘 통과다 —
// 읽기 전용은 "방문자는 그대로 본다"가 약속이다. 브라우저가 사용자 키로 데이터 저장소에 바로 쓰는
// profiles·projects는 SQL 트리거가 같은 상태를 보고 따로 막는다(두 겹).
//
// 새 쓰기 API를 만들면 여기 손댈 것 없이 읽기 전용에 막힌다(기본이 막힘). 잠금 중에도 열어 둘
// 주소만 READONLY_ALLOW에 더한다 — 그때는 왜 열어도 안전한지 그 줄에 적는다.

export type SiteLocks = { readonly: boolean; uploadsClosed: boolean };
export type LockCode = "SITE_READONLY" | "UPLOADS_CLOSED";

const OPEN: SiteLocks = { readonly: false, uploadsClosed: false };

// 읽기 전용 중에도 받는 쓰기. 앞부분이 같으면 통과(끝 "/"까지 맞춰 이웃 주소를 안 열게).
const READONLY_ALLOW: { prefix: string; methods?: string[] }[] = [
  { prefix: "/api/admin/" },              // 관리자 조치 — 잠금 풀기·신고 내리기도 여기다
  { prefix: "/api/auth/logout" },         // 로그아웃은 피해를 줄이는 쪽
  { prefix: "/api/tokens/", methods: ["DELETE"] }, // 내 토큰 끊기(새 토큰 만들기 /api/tokens는 막힘)
  { prefix: "/api/cron/" },               // 점검 크론 — 경보가 계속 와야 한다
  { prefix: "/api/worker/heartbeat" },    // 워커 살아 있음 표시 — 막으면 '워커 죽음' 헛경보
  { prefix: "/api/worker/pause" },        // 촬영 멈춤은 피해를 줄이는 쪽
  { prefix: "/api/mcp" },                 // 원격 MCP — 쓰는 도구는 인제스트 API를 HTTP로 다시 불러 거기서 막힌다
  { prefix: "/api/track" },               // 조회 수 — 사용자 글이 아니고 IP당 한도가 있다
  { prefix: "/api/analytics" },           // 사용 기록 — 위와 같음
  { prefix: "/api/report" },              // 신고 — 사고 중에도 받는 게 낫다(한도 있음)
];

// 업로드 닫기가 막는 쓰기 — 새 파일·새 작품이 들어오는 길.
const UPLOAD_PATHS: RegExp[] = [
  /^\/api\/storage\/sign(\/|$)/,          // 브라우저 직접 올리기 서명(작품 파일·영상·사진)
  /^\/api\/ingest(\/|$)/,                 // AI 올리기(초안·마무리·재촬영 묶음)
  /^\/api\/projects\/[^/]+\/demo-assets(\/|$)/,
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 이 요청을 막아야 하면 까닭 코드, 아니면 null. 순수 함수 — scripts/probe-site-lock-unit.mts. */
export function lockBlock(method: string, pathname: string, locks: SiteLocks): LockCode | null {
  if (!pathname.startsWith("/api/")) return null;
  const m = method.toUpperCase();
  if (SAFE_METHODS.has(m)) return null;
  if (locks.readonly) {
    const allowed = READONLY_ALLOW.some(
      (a) => pathname.startsWith(a.prefix) && (!a.methods || a.methods.includes(m)),
    );
    if (!allowed) return "SITE_READONLY";
  }
  if (locks.uploadsClosed && UPLOAD_PATHS.some((re) => re.test(pathname))) return "UPLOADS_CLOSED";
  return null;
}

// 막을 때 내는 말. middleware는 사전(lib/i18n/dictionaries) 전체를 싣지 않으려고 두 줄만 여기 둔다.
export const LOCK_MESSAGE: Record<LockCode, { ko: string; en: string }> = {
  SITE_READONLY: {
    ko: "지금은 점검 중이라 저장할 수 없어요. 보는 건 그대로 돼요. 잠시 뒤 다시 해 주세요.",
    en: "nookframe is read-only for maintenance right now. Viewing still works — please try again later.",
  },
  UPLOADS_CLOSED: {
    ko: "지금은 점검 중이라 새로 올릴 수 없어요. 잠시 뒤 다시 해 주세요.",
    en: "Uploads are paused for maintenance right now. Please try again later.",
  },
};

// ── 상태 읽기 (middleware용) ─────────────────────────────────────────────────
// 인스턴스마다 5초 기억한다 — 쓰기 요청마다 데이터 저장소에 묻지 않게. 버튼을 누르고 길어야 5초 뒤면
// 모든 인스턴스가 따른다. 읽기가 실패하면 열린 것으로 본다(데이터 저장소가 아프다고 사이트 전체를
// 잠그지 않는다 — 그때 사용자 키 쓰기는 어차피 실패하고, 트리거가 둘째 겹이다).
const TTL_MS = 5_000;
let cached: { at: number; locks: SiteLocks } | null = null;

export async function readSiteLocks(): Promise<SiteLocks> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.locks;
  let locks = OPEN;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const res = await fetch(`${url}/rest/v1/rpc/site_locks`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as Partial<SiteLocks> | null;
        locks = { readonly: body?.readonly === true, uploadsClosed: body?.uploadsClosed === true };
      }
    }
  } catch {
    // 열린 것으로 둔다(위 주석).
  }
  cached = { at: now, locks };
  return locks;
}
