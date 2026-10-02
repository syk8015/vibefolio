import { getToken, getOrigin } from "./config.js";

// JSON API 호출 한 곳. drafts·rerecord가 같은 인증·에러 처리를 쓰도록 뽑아 둔다
// (예전엔 drafts.js 안에 있었다). multipart를 쓰는 publish는 자체 경로.

export async function api(method, path, { token, origin, body } = {}) {
  if (!token) {
    throw new Error(
      "No token. Press [Copy prompt] at nookframe.com/dashboard -> Upload with AI and run the `npx nookframe login <code>` step from that prompt (or set the `NOOKFRAME_TOKEN` env var).",
    );
  }
  const res = await fetch(`${(origin || getOrigin()).replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // field = 거절 사유가 가리키는 payload 경로(2026-10-02, NF-11). 구버전 서버는 키가 없다.
  if (!res.ok) throw new Error(`${data.error || `Request failed (HTTP ${res.status})`}${data.field ? ` [field: ${data.field}]` : ""}`);
  return data;
}

/** CLI 명령들이 공유하는 연결 정보(토큰·origin). args.origin이 있으면 우선. */
export function conn(args = {}) {
  return { token: getToken(), origin: args.origin || getOrigin() };
}
