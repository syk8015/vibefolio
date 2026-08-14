// 홍보 클립 팩토리 공용 헬퍼 (2026-08) — /admin/promo, /api/admin/promo/*,
// local-runner/promo-*.ts가 전부 이 파일 하나를 참조한다. 추적 링크 발급(여기)
// 과 집계(app/admin/promo/page.tsx)가 같은 함수를 쓰므로 절대 서로 어긋나지
// 않는다. lib/r2.ts와 같은 이유로 순수 TS만 사용 — Next 앱과 local-runner(tsx)
// 양쪽에서 별칭/상대 경로로 다 import 가능해야 하므로 next/* 등은 쓰지 않는다.

import { SITE_URL } from "./email-templates";

// ── 촬영 길이 산정 ───────────────────────────────────────────────────────
// components/LoggedInHeadline.tsx의 타이핑 상태기계와 반드시 같은 값으로
// 맞춰야 한다(그쪽 매직넘버를 그대로 옮겨온 것 — 그쪽이 바뀌면 여기도 같이
// 바꿀 것): 글자당 90~150ms(평균 120), reply 앞 650ms 코멘트비트, 다 타이핑된
// 후 지우기 시작 전 1600ms 대기. forceText 프리롤 800ms(LoggedInHeadline)도
// 포함해야 촬영이 첫 글자를 놓치지 않는다.
const AVG_CHAR_MS = 120;
const COMMENT_BEAT_MS = 650;
const READ_PAUSE_MS = 1600;
const PROMO_PREROLL_MS = 800;
const SAFETY_MARGIN_MS = 700;
const MIN_RECORD_MS = 3000; // 아주 짧은 문구도 클립 형태를 갖추도록

// 지우기 애니메이션이 시작되기 전(=타이핑이 끝나고 다 읽을 시간까지)까지만
// 녹화한다. 랜덤 타이핑 속도(90~150ms) 때문에 정확히 맞진 않지만, 안전마진을
// 넉넉히 둬서 "글자가 잘리는" 실패보다 "끝에 정지 프레임 한두 컷 남는" 쪽으로
// 치우치게 했다 — 후자가 훨씬 무해하다.
export function estimateTaglineRecordMs(tagline: { text: string; reply?: string | null }): number {
  const reply = tagline.reply ?? "";
  const typingMs =
    tagline.text.length * AVG_CHAR_MS +
    (reply.length > 0 ? COMMENT_BEAT_MS + reply.length * AVG_CHAR_MS : 0);
  const total = PROMO_PREROLL_MS + typingMs + READ_PAUSE_MS + SAFETY_MARGIN_MS;
  return Math.max(MIN_RECORD_MS, Math.round(total));
}

// ── 추적 링크 ────────────────────────────────────────────────────────────
// utm_campaign은 DB 컬럼에 저장하지 않고 항상 이 함수로 파생한다 — 포스트
// id가 이미 전역 유일하므로 별도 slug 발급이 불필요하고, 링크 발급 쪽과 집계
// 쪽(app/admin/promo/page.tsx)이 반드시 같은 값을 보게 된다.
export function promoCampaignValue(postId: string): string {
  return `promo-${postId}`;
}

export function promoTrackingUrl({ channel, postId }: { channel: string; postId: string }): string {
  const params = new URLSearchParams({
    utm_source: channel,
    utm_medium: "promo_clip",
    utm_campaign: promoCampaignValue(postId),
  });
  return `${SITE_URL}/?${params.toString()}`;
}

// ── 채널 ────────────────────────────────────────────────────────────────
// 자유 텍스트 입력(디시·기타 커뮤니티 등 고정 enum이 아님) — 아래는 UI
// datalist 자동완성 힌트 + 알려진 채널의 업로드 페이지 바로가기일 뿐, 목록에
// 없는 채널명도 그대로 쓸 수 있다(CHANNEL_UPLOAD_LINKS에 없으면 바로가기만 생략).
export const PROMO_CHANNEL_HINTS = [
  "인스타 릴스",
  "유튜브 쇼츠",
  "틱톡",
  "X",
  "스레드",
  "디시인사이드",
] as const;

export const CHANNEL_UPLOAD_LINKS: Record<string, string> = {
  "인스타 릴스": "https://www.instagram.com/",
  "유튜브 쇼츠": "https://studio.youtube.com/",
  "틱톡": "https://www.tiktok.com/upload",
  "X": "https://x.com/compose/post",
  "스레드": "https://www.threads.net/",
  "디시인사이드": "https://www.dcinside.com/",
};

// ── 캡션 생성 ───────────────────────────────────────────────────────────
// 가벼운 텍스트 생성 작업이라 opus 계열은 과함 — local-runner/explore.ts와
// 같은 sonnet 계열 기본값.
export const PROMO_CAPTION_MODEL = process.env.PROMO_CAPTION_MODEL || "claude-sonnet-5";
