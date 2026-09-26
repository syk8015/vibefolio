// 설정 화면 "로그인 방법"의 구글·깃허브 연결/해제(2026-09-25, components/settings/LoginMethods).
// 09-26에 명함 탭에서 설정 화면(/settings)으로 옮겼다 — 명함 탭엔 남에게 보여줄 명함만 둔다.
// 왜: 깃허브 대표 메일 ≠ 구글 메일이면 다른 버튼으로 들어오는 순간 계정이 하나 더 생긴다
// (09-24 실제로 겪음, lib/lastLogin 머리 주석). 쓰는 방법을 미리 이 계정에 붙여 두는 길이다.
//
// 연결도 로그인처럼 공급자 화면을 거쳐 /auth/callback으로 돌아온다. 콜백이 평소처럼 실패를
// /login?error=oauth로 보내면, 이미 로그인한 사람이라 미들웨어가 대시보드로 튕겨 사유가 사라진다.
// 그래서 연결 버튼은 콜백 주소에 link=1을 싣고, 콜백은 결과를 돌아갈 화면에 link=<결과>로 붙인다.
// Supabase 대시보드의 "Allow manual linking"이 켜져 있어야 한다(꺼져 있으면 linkIdentity가 거절).
import { withVia } from "./lastLogin";

export const LINK_PROVIDERS = ["google", "github"] as const;
export type LinkProvider = (typeof LINK_PROVIDERS)[number];
export const LINK_RESULTS = ["linked", "taken", "failed"] as const;
export type LinkResult = (typeof LINK_RESULTS)[number];

/** 연결을 마치고 돌아올 곳 — 로그인 방법 목록이 있는 설정 화면. */
export const LINK_RETURN_PATH = "/settings";

export function isLinkProvider(v: unknown): v is LinkProvider {
  return typeof v === "string" && (LINK_PROVIDERS as readonly string[]).includes(v);
}

export function isLinkResult(v: unknown): v is LinkResult {
  return typeof v === "string" && (LINK_RESULTS as readonly string[]).includes(v);
}

/** linkIdentity의 redirectTo. via=는 로그인과 같다 — 연결에 성공하면 "지난번에 사용"도 이 방법이 된다. */
export function linkRedirectTo(origin: string, provider: LinkProvider): string {
  return withVia(`${origin}/auth/callback?link=1&next=${encodeURIComponent(LINK_RETURN_PATH)}`, provider);
}

/** 공급자가 code 없이 돌려보냈을 때(취소·거절)의 결과. Supabase는 error_code를 쿼리에 싣는다.
 *  identity_already_exists는 두 경우에 같이 쓰인다 — 남의 계정("…linked to another user")과
 *  이미 이 계정("Identity is already linked"). 문구가 바뀌어도 안전한 쪽(남의 계정)으로 떨어진다. */
export function linkErrorResult(params: URLSearchParams): LinkResult {
  if (params.get("error_code") !== "identity_already_exists") return "failed";
  const desc = (params.get("error_description") ?? "").trim();
  return /^identity is already linked$/i.test(desc) ? "linked" : "taken";
}

/** 결과를 실어 돌아갈 주소. next는 safeNext를 거친 같은 사이트 경로여야 한다. */
export function linkReturnUrl(origin: string, next: string, result: LinkResult, provider: string | null): string {
  const u = new URL(next, origin);
  u.searchParams.set("link", result);
  if (isLinkProvider(provider)) u.searchParams.set("provider", provider);
  return u.toString();
}

type IdentityLike = { identity_id: string; identity_data?: { [key: string]: unknown } };

const identityEmail = (i: IdentityLike) =>
  typeof i.identity_data?.email === "string" ? i.identity_data.email.toLowerCase() : "";

/** [해제]를 보여 줄지. Supabase는 계정 메일을 가진 방법을 떼면 계정 메일을 남은 방법의 메일로
 *  바꿔 버린다(UpdateUserEmailFromIdentities) — 메일 코드·비밀번호 로그인 주소와 알림 메일이
 *  말없이 바뀐다. 그래서 떼도 계정 메일을 다른 방법이 붙들고 있을 때만 허락한다. 계정 메일과 같은
 *  메일의 방법도 막는다 — 떼도 다음 로그인 때 같은 메일이라 저절로 다시 붙어 뗀 의미가 없다.
 *  ⚠️ 자동 연결은 공급자의 **확인된 메일 전부**를 본다(DetermineAccountLinking — 대표 메일만이 아니다).
 *  identity_data엔 대표 메일만 있어 여기선 못 가린다: 보조 메일에 계정 메일이 있는 깃허브는 떼도
 *  다음 로그인에 다시 붙는다.
 *  그래서 해제 확인 문구는 "새 계정이 생길 수 있어요"로 단정하지 않는다. */
export function canUnlink(target: IdentityLike, all: readonly IdentityLike[], accountEmail: string | null | undefined): boolean {
  const account = (accountEmail ?? "").toLowerCase();
  if (!account || identityEmail(target) === account) return false;
  return all.some((o) => o.identity_id !== target.identity_id && identityEmail(o) === account);
}
