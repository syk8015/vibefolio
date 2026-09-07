import { getToken, getOrigin } from "./config.js";

// JSON API 호출 한 곳. drafts·rerecord가 같은 인증·에러 처리를 쓰도록 뽑아 둔다
// (예전엔 drafts.js 안에 있었다). multipart를 쓰는 publish는 자체 경로.

export async function api(method, path, { token, origin, body } = {}) {
  if (!token) {
    throw new Error(
      "No token. Create one at nookframe.com/dashboard -> Connect tab, then set the `NOOKFRAME_TOKEN` env var or run `npx nookframe login <token>`.",
    );
  }
  const res = await fetch(`${(origin || getOrigin()).replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

/** CLI 명령들이 공유하는 연결 정보(토큰·origin). args.origin이 있으면 우선. */
export function conn(args = {}) {
  return { token: getToken(), origin: args.origin || getOrigin() };
}
