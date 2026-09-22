import { saveToken, getOrigin } from "./config.js";

// `nookframe login <값>` — 연결(2026-09-16부터 2가지 입력).
//
// 왜 바뀌었나: 예전엔 대시보드가 발급한 **raw 액세스 토큰**이 붙여넣기 프롬프트 1단계에
// 그대로 박혀 있었다. 사람은 그 프롬프트를 AI 채팅창에 붙여넣으므로, 살아 있는 크리덴셜이
// 대화 기록에 영구히 남았다. 이제 프롬프트에는 **1회용 페어링 코드**(`nf_code_…`, 30분·1회)만
// 들어가고, 이 명령이 서버에서 진짜 토큰으로 바꿔 받아 ~/.nookframe/config.json(0600)에 저장한다.
// 기록에 남은 코드는 이미 죽어 있어 쓸모가 없다.
//
// 옛 토큰(`nf_live_…`)도 그대로 받는다 — 이미 저장해 둔 토큰·환경변수를 깨뜨리지 않는다.

const CODE_PREFIX = "nf_code_";
const TOKEN_PREFIX = "nf_live_";

export async function runLogin(args) {
  const value = String(args._[0] ?? (typeof args.token === "string" ? args.token : "")).trim();
  if (!value) {
    throw new Error(
      "Usage: npx nookframe login <code>  (press [Copy prompt] on nookframe.com/dashboard -> Add project — the code is in step 1 of that prompt)",
    );
  }
  const origin = (args.origin || getOrigin()).replace(/\/$/, "");

  if (value.startsWith(CODE_PREFIX)) {
    const token = await exchange(value, origin);
    saveToken(token);
    console.log("✓ Paired with Nookframe. Access token saved to ~/.nookframe/config.json");
    // 코드가 한 번만 쓰이는 물건임을 말해 둔다 — 같은 프롬프트를 다시 실행하려는 AI가
    // 401을 만나고 나서야 알게 되면, 멀쩡한 payload를 의심하기 시작한다.
    console.log("  That code is now spent (single use). Next: npx nookframe publish --file <payload.json>");
    return;
  }

  if (value.startsWith(TOKEN_PREFIX)) {
    saveToken(value);
    console.log("✓ Token saved to ~/.nookframe/config.json");
    return;
  }

  throw new Error(
    `That is neither a Nookframe pairing code (${CODE_PREFIX}…) nor an access token (${TOKEN_PREFIX}…). Copy the prompt again on nookframe.com/dashboard -> Add project and use the code in step 1.`,
  );
}

async function exchange(code, origin) {
  // 코드는 본문으로만 보낸다(쿼리 금지) — 프록시 로그·리퍼러에 남지 않게, PAT와 같은 규율.
  const res = await fetch(`${origin}/api/connect/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body?.token !== "string") {
    throw new Error(body?.error || `Could not exchange that code (HTTP ${res.status}).`);
  }
  return body.token;
}
