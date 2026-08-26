import { getToken, getOrigin } from "./config.js";

// JSON API 호출 한 곳. drafts·rerecord가 같은 인증·에러 처리를 쓰도록 뽑아 둔다
// (예전엔 drafts.js 안에 있었다). multipart를 쓰는 publish는 자체 경로.

export async function api(method, path, { token, origin, body } = {}) {
  if (!token) {
    throw new Error(
      "토큰이 없어요. nookframe.com/dashboard → 연결 탭에서 발급 후 `NOOKFRAME_TOKEN` 환경변수에 넣거나 `npx nookframe login <token>` 하세요.",
    );
  }
  const res = await fetch(`${(origin || getOrigin()).replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (HTTP ${res.status})`);
  return data;
}

/** CLI 명령들이 공유하는 연결 정보(토큰·origin). args.origin이 있으면 우선. */
export function conn(args = {}) {
  return { token: getToken(), origin: args.origin || getOrigin() };
}
