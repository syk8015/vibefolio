import { revalidateTag } from "next/cache";

// 명함·작품 페이지 읽기는 unstable_cache 60초(tag "portfolio")다. 공개·삭제·
// 내림 뒤 이걸 안 비우면 방금 바꾼 게 최대 1분 옛 모습으로 보인다.
// "max"(stale-while-revalidate)는 다음 방문 한 번에 옛 화면을 주고 뒤에서
// 갱신한다 — 공개 직후 "내 프레임"을 여는 바로 그 한 번이 옛 화면이 되므로,
// 즉시 만료(expire: 0)로 다음 요청이 새로 읽게 한다.
export function revalidatePortfolio() {
  revalidateTag("portfolio", { expire: 0 });
}
