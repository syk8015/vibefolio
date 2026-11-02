// 관리자 추가 인증(2026-11-02, 보안 로드맵 1단계 5번) — 판정만 하는 순수 함수(probe-admin-stepup-unit).
//
// 관리자 화면·API는 '집 나라'(system_status.admin_home_countries, 기본 KR)에서는 로그인만으로 열리고,
// 그 밖의 나라에서는 인증 앱 6자리를 넣은 로그인(Supabase MFA, 토큰의 aal = "aal2")에서만 열린다.
// 세션을 훔친 사람은 대개 다른 나라에서 쓰므로 여기서 멈춘다. 일반 사용자는 건드리지 않는다
// (영어권 사용자는 여행이 잦다 — 10-31 결정).
// 6자리를 한 번 넣으면 그 로그인이 끝날 때까지 aal2로 남는다(새로 고침해도 유지).

export const DEFAULT_HOME_COUNTRIES = ["KR"];

/** 데이터 저장소 칸 → 두 글자 나라 코드 목록. 이상한 값은 버린다. */
export function normalizeCountries(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const c of v) {
    if (typeof c === "string" && /^[A-Za-z]{2}$/.test(c.trim())) out.add(c.trim().toUpperCase());
  }
  return [...out];
}

/** 이 요청에 인증 앱 6자리가 더 필요한가. 나라를 모르면("?"·빈 값) 처음 보는 나라로 친다. */
export function needsStepUp(p: { country: string | null | undefined; aal: string | null | undefined; homes: string[] }): boolean {
  if (p.aal === "aal2") return false;
  const c = (p.country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return true;
  return !p.homes.includes(c);
}

/** 인증 뒤 돌아갈 곳 — 관리자 화면 안의 주소만. 확인 화면 자신·밖 주소·이상한 모양은 /admin. */
export function adminNext(next: string | null | undefined): string {
  if (!next || !/^\/admin(\/[a-z0-9_-]+)*\/?$/.test(next)) return "/admin";
  if (/^\/admin\/verify\/?$/.test(next)) return "/admin";
  return next;
}
