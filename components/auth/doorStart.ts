import { cookies } from "next/headers";
import { safeNext } from "@/lib/safeNext";
import { LAST_LOGIN_COOKIE, isLoginMethod } from "@/lib/lastLogin";
import type { DoorStart } from "./AuthDoor";

// 문(AuthDoor)의 첫 모습을 서버에서 정한다 — /login과 /signup이 같이 쓴다. 브라우저에서 정하면
// 첫 화면(메일 코드)이 한 번 그려졌다가 비밀번호 칸으로 바뀌어 화면이 통째로 뛴다.
// "지난번에 사용" 쿠키(lib/lastLogin)는 httpOnly가 아니라 브라우저의 readLastLoginMethod()와 같은 값이다.
type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

export async function doorStart(search: Search, opts: { handoff?: boolean } = {}): Promise<DoorStart> {
  // 인증 콜백 실패(/auth/callback → ?error=). oauth = 구글·깃허브 화면에서 취소했거나 공급자가 거절.
  // auth = 메일 링크 코드 교환 실패 — 재설정 링크였는지(가던 곳이 /reset-password) 가입 인증이었는지로 가른다.
  const error = one(search.error);
  const notice = error === "oauth" ? "oauth"
    : error === "auth" ? (safeNext(one(search.next)).startsWith("/reset-password") ? "reset" : "confirm")
    : null;
  const raw = (await cookies()).get(LAST_LOGIN_COOKIE)?.value;
  const lastMethod = isLoginMethod(raw) ? raw : null;

  // 기본은 메일 코드. 비밀번호 칸으로 여는 건 ?mode=password(비밀번호 찾기의 [로그인으로 돌아가기])나
  // 이 기기에서 지난번에 비밀번호로 들어온 사람. 단 폰에서 보낸 메일 링크는 곧장 코드 길로(09-24),
  // 구글·깃허브 취소 뒤엔 "다시 하거나"가 가리키는 그 버튼들이 보이는 문으로 연다.
  const mode = opts.handoff ? "code"
    : one(search.mode) === "password" ? "password"
    : notice === "oauth" ? "code"
    : lastMethod === "password" ? "password"
    : "code";

  return { mode, notice, lastMethod };
}
