// 아이디(username) 입력 규칙 한 벌 — 가입·온보딩·명함 탭이 같이 쓴다.
//
// 아이디는 주소(nookframe.com/{username})라서 소문자로만 저장한다. 폰 키보드가
// 첫 글자를 대문자로 만들면 "Alexvibe"로 저장되고, 소문자로 적힌 링크는 404가 됐다
// (2026-09-22 A7). DB는 lower(username) 유일 인덱스라 대소문자만 다른 아이디는
// 어차피 공존할 수 없다 — 입력 단계에서 소문자로 접어 두면 겹침 검사와 주소가 맞는다.

export const USERNAME_MIN = 2;
// 방문 집계(/api/track)가 40자 넘는 아이디를 버리고, 명함은 말줄임 없이 그린다.
export const USERNAME_MAX = 30;
export const NAME_MAX = 40;
export const BIO_MAX = 140;

export const USERNAME_RE = /^[a-z0-9_-]+$/;
// <input pattern>용 — 입력값은 이미 소문자로 접혀 들어온다.
export const USERNAME_PATTERN = "[a-z0-9_-]+";

// 입력칸 onChange에서 쓴다: 소문자로 접고 허용 문자만 남긴다.
export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, USERNAME_MAX);
}

export function isValidUsername(value: string): boolean {
  return value.length >= USERNAME_MIN && value.length <= USERNAME_MAX && USERNAME_RE.test(value);
}

// PostgREST ilike 패턴 — `_`는 LIKE에서 "아무 글자 하나"라 그대로 넣으면 a_b가
// axb와 겹친다고 나온다. 역슬래시로 이스케이프해 글자 그대로 비교한다.
export function usernameIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
