// 연결 창의 "AI가 작업을 시작했어요"(2026-09-30) — 순수 판정. 서버 읽기는 app/api/connect/activity.
//
// 신호 = 이 사람 계정에서 AI 쪽 흔적이 새로 생겼나. 두 가지다:
//   - 페어링 코드 교환(connect_codes.used_at) — 터미널 AI가 `login <코드>`를 실행한 순간
//   - 토큰 사용(api_tokens.last_used_at) — 이미 로그인된 CLI, stdio MCP, Claude 원격 커넥터(OAuth
//     토큰도 api_tokens에 산다)가 서버를 부른 순간
// 브라우저 시계와 서버 시계가 어긋나도 되게, 복사 직후 받은 값(기준점)보다 새 값이 **뒤**인지만 본다.
// 답만 주는 채팅 AI(글자 복붙)는 서버를 부르지 않으므로 이 표시가 뜨지 않는다 — 기존 기다림 문구 그대로.

/** 흔적 시각들 중 가장 늦은 것(ISO). 하나도 없으면 null. */
export function latestActivity(times: (string | null | undefined)[]): string | null {
  let best: number | null = null;
  for (const t of times) {
    const ms = t ? Date.parse(t) : NaN;
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  }
  return best === null ? null : new Date(best).toISOString();
}

/** 기준점 뒤에 새 흔적이 생겼나. 기준점이 null이면(흔적이 전혀 없던 계정) 흔적이 생기기만 하면 시작. */
export function aiStarted(baseline: string | null, latest: string | null): boolean {
  if (!latest) return false;
  if (!baseline) return true;
  return Date.parse(latest) > Date.parse(baseline);
}
