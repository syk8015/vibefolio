import { createHmac, timingSafeEqual } from "node:crypto";

// 초안 파일 열쇠(2026-11-02, 보안 로드맵 2단계 1번 — audit-4 초안 비공개 설계).
//
// /api/preview는 공개된 작품의 폴더만 누구에게나 보여 준다(lib/previewAccess.ts). 초안·내린 작품의
// 폴더는 이 열쇠가 든 주소로만 열린다: /api/preview/{uid}/{폴더}/~v1.<만료>.<서명>/index.html
//   - 열쇠는 주소의 **경로 한 칸**이다. 쿼리(?t=)로 두면 HTML 안의 ./app.js 같은 상대 주소가 열쇠를 잃고,
//     쿠키는 미리보기 도메인이 nookframe.com iframe 안의 남의 사이트라 못 쓴다. 폴더 다음 칸에 두면
//     상대 주소가 모두 열쇠를 물려받고, uid가 3번째 칸에 그대로 남아 주인 검사(local-runner/job.ts 등)도 안 바뀐다.
//   - 열쇠는 폴더 하나에만 맞고 짧게 산다(주인 미리보기 1시간). 새면 그 시간 동안 그 폴더만 열린다.
//   - 서명 비밀은 서비스 키에서 뽑는다(저장할 값이 없다). PREVIEW_TOKEN_SECRET이 있으면 그걸 쓴다.
//     서비스 키를 바꾸면 살아 있던 열쇠가 모두 죽는다 — 그래도 된다(짧게 사는 값).

export const OWNER_PREVIEW_TTL_S = 3600;
const PREFIX = "~v1.";

export function previewTokenSecret(): string {
  const own = process.env.PREVIEW_TOKEN_SECRET;
  if (own) return own;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) throw new Error("preview token secret unavailable");
  return createHmac("sha256", svc).update("nookframe-preview-token-v1").digest("base64url");
}

function sign(secret: string, uid: string, folder: string, exp: number): string {
  return createHmac("sha256", secret).update(`${uid}/${folder}/${exp}`).digest("base64url");
}

/** 순수 — 열쇠 한 칸(`~v1.<만료초>.<서명>`). probe-preview-token-unit. */
export function mintWith(secret: string, uid: string, folder: string, ttlS: number, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + Math.max(1, Math.floor(ttlS));
  return `${PREFIX}${exp}.${sign(secret, uid, folder, exp)}`;
}

/** 순수 — 이 칸이 이 폴더의 살아 있는 열쇠인가. 모양이 틀리면 false(던지지 않는다). */
export function verifyWith(secret: string, seg: string, uid: string, folder: string, nowMs = Date.now()): boolean {
  const m = /^~v1\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(seg);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp * 1000 <= nowMs) return false;
  const want = Buffer.from(sign(secret, uid, folder, exp));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function isTokenSegment(seg: string | undefined): boolean {
  return !!seg && seg.startsWith("~");
}

/** 우리 업로드 주소(`/api/preview/{uid}/{폴더}/…`)를 나눈다. 아니면 null. */
export function splitPreviewPath(demoUrl: string): { uid: string; folder: string; rest: string } | null {
  const m = /^\/api\/preview\/([^/]+)\/([^/]+)\/(.+)$/.exec(demoUrl.split(/[?#]/)[0]);
  if (!m || isTokenSegment(m[3].split("/")[0])) return null;
  return { uid: m[1], folder: m[2], rest: m[3] };
}

/** 주인·관리자용 — 열쇠가 든 미리보기 경로(상대). 우리 업로드 주소가 아니면 null. */
export function tokenizedPreviewPath(demoUrl: string, ttlS = OWNER_PREVIEW_TTL_S): string | null {
  const p = splitPreviewPath(demoUrl);
  if (!p) return null;
  const tok = mintWith(previewTokenSecret(), p.uid, p.folder, ttlS);
  return `/api/preview/${p.uid}/${p.folder}/${tok}/${p.rest}`;
}
