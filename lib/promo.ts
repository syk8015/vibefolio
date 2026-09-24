// 홍보 클립 팩토리 공용 헬퍼 (2026-08) — /admin/promo, /api/admin/promo/*,
// local-runner/promo-*.ts가 전부 이 파일 하나를 참조한다. 추적 링크 발급(여기)
// 과 집계(app/admin/promo/page.tsx)가 같은 함수를 쓰므로 절대 서로 어긋나지
// 않는다. lib/r2.ts와 같은 이유로 순수 TS만 사용 — Next 앱과 local-runner(tsx)
// 양쪽에서 별칭/상대 경로로 다 import 가능해야 하므로 next/* 등은 쓰지 않는다.

import { SITE_URL } from "./email-templates";

// ── 촬영 길이 산정 ───────────────────────────────────────────────────────
// components/LoggedInHeadline.tsx의 타이핑 상태기계와 반드시 같은 값으로
// 맞춰야 한다(그쪽 매직넘버를 그대로 옮겨온 것 — 그쪽이 바뀌면 여기도 같이
// 바꿀 것): 글자당 타이핑 90~150ms(평균 120)·지우기 50~85ms(평균 67.5), reply
// 앞 650ms 코멘트비트, 다 타이핑된 후 지우기 전 1600ms 대기, reply→본문 지우기
// 전환 120ms. forceText 프리롤 800ms(LoggedInHeadline)도 포함해야 촬영이 첫
// 글자를 놓치지 않는다.
const AVG_TYPE_CHAR_MS = 120;
const AVG_ERASE_CHAR_MS = 67.5;
const COMMENT_BEAT_MS = 650;
const READ_PAUSE_MS = 1600;
const ERASE_HANDOFF_MS = 120; // reply 지우기 완료 → 본문 지우기 시작
// local-runner/promo-record.ts도 쓴다 — 헤드리스 녹화는 "첫 글자가 찍힌 순간"부터
// 남은 시간을 세므로 프리롤을 빼야 한다.
const PROMO_PREROLL_MS = 800;
const SAFETY_MARGIN_MS = 700;
const MIN_RECORD_MS = 3000; // 아주 짧은 문구도 클립 형태를 갖추도록

// **지우기가 완전히 끝난 빈 화면**까지 녹화한다(지우기 시작 전이 아니라) —
// 후처리에서 로고 엔드캡(promo-endcap.ts)을 바로 이어붙이므로, 문구가 남은
// 채로 뚝 끊기면 어색하고 빈 화면에서 로고 타이핑이 시작돼야 자연스럽다.
// 랜덤 타이핑/삭제 속도 때문에 정확히 맞진 않지만, 다음 사이클 재시작까지
// 420ms 여유가 있고 안전마진(700ms)이 그보다 크므로 다음 문구가 살짝
// 보이는 사고는 나지 않는다.
export function estimateTaglineRecordMs(tagline: { text: string; reply?: string | null }): number {
  const reply = tagline.reply ?? "";
  const hasReply = reply.length > 0;
  const typingMs =
    tagline.text.length * AVG_TYPE_CHAR_MS + (hasReply ? COMMENT_BEAT_MS + reply.length * AVG_TYPE_CHAR_MS : 0);
  const eraseMs =
    (hasReply ? reply.length * AVG_ERASE_CHAR_MS + ERASE_HANDOFF_MS : 0) + tagline.text.length * AVG_ERASE_CHAR_MS;
  const total = PROMO_PREROLL_MS + typingMs + READ_PAUSE_MS + eraseMs + SAFETY_MARGIN_MS;
  return Math.max(MIN_RECORD_MS, Math.round(total));
}

// ── 오프닝(클립 시작 방식) ─────────────────────────────────────────────
// 두 가지를 공존시킨다(2026-08-19 사용자 결정): 어느 쪽이 실제로 먹히는지는
// 올려봐야 알기 때문에, 같은 문구를 양쪽으로 찍어 비교할 수 있어야 한다.
//   full — 빈 화면(깜빡이는 커서)에서 시작해 한 글자씩. 페이드인 있음(원래 방식).
//   hook — 문구가 이미 쳐진 지점에서 시작. 페이드 없음(피드 자동재생용).
export type PromoOpening = "full" | "hook";

export const PROMO_OPENINGS: Record<PromoOpening, { label: string; hint: string }> = {
  hook: { label: "바로 문구부터", hint: "문구가 이미 쳐진 상태로 시작 (피드용)" },
  full: { label: "처음부터", hint: "빈 화면에서 한 글자씩 (원래 방식)" },
};

export function isPromoOpening(v: unknown): v is PromoOpening {
  return v === "full" || v === "hook";
}

// ── 추적 링크 ────────────────────────────────────────────────────────────
// utm_campaign은 DB 컬럼에 저장하지 않고 항상 이 함수로 파생한다 — 포스트
// id가 이미 전역 유일하므로 별도 slug 발급이 불필요하고, 링크 발급 쪽과 집계
// 쪽(app/admin/promo/page.tsx)이 반드시 같은 값을 보게 된다.
function promoCampaignValue(postId: string): string {
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
// 고정 4채널만 둔다(2026-08-27 사용자 확정) — 자유 텍스트 입력·채널 추가 폼은
// 폐기했다. 클립 카드에서 로고 버튼 한 번 = "이 채널에 올린다"이므로 목록이
// 길면 그 동작이 흐려진다. 디시인사이드 등 커뮤니티는 제외(추후 필요해지면
// 여기 배열에만 추가하면 UI가 따라온다).
//   label     — promo_posts.channel에 그대로 저장되는 값. 채널별 성적 집계
//               (app/admin/promo/page.tsx)의 키이므로 **바꾸면 옛 기록과 갈라진다**.
//   host      — components/SocialBadge.tsx의 브랜드(로고·색) 조회 키. 로고 SVG를
//               여기 복제하지 않고 명함에 쓰는 것과 같은 것을 그대로 쓴다.
//   uploadUrl — 버튼을 눌렀을 때 새 탭으로 여는 업로드 화면.
//   feedLocale — 이 채널에 올리는 클립 언어(09-24 광고 계획 결정: 인스타·유튜브·X 피드는
//               영어, 스레드는 한국어). [예약]이 클립 언어로 채널을 고를 때 쓴다.
//   auto      — 서버가 예약 시각에 올리는 채널인가(docs/promo-publish.md §2).
//               유튜브는 API 심사 전엔 올린 영상이 비공개로 잠겨 3단계까지 손으로,
//               X는 링크 글 요금 때문에 계속 손으로(v1 결정).
export const PROMO_CHANNELS = [
  { label: "인스타", host: "instagram.com", uploadUrl: "https://www.instagram.com/", feedLocale: "en", auto: true },
  { label: "스레드", host: "threads.net", uploadUrl: "https://www.threads.net/", feedLocale: "ko", auto: true },
  { label: "유튜브", host: "youtube.com", uploadUrl: "https://studio.youtube.com/", feedLocale: "en", auto: false },
  { label: "X", host: "x.com", uploadUrl: "https://x.com/compose/post", feedLocale: "en", auto: false },
] as const;

export type PromoLocale = "ko" | "en";
export type PromoChannelLabel = (typeof PROMO_CHANNELS)[number]["label"];

/** [예약]이 이 언어의 클립을 싣는 채널 — 서버가 올리는 채널 중 피드 언어가 같은 것. */
export function promoScheduleChannels(locale: PromoLocale): PromoChannelLabel[] {
  return PROMO_CHANNELS.filter((c) => c.auto && c.feedLocale === locale).map((c) => c.label);
}

// ── 캡션 꼬리 ────────────────────────────────────────────────────────────
// 캡션 본문은 사람이 클립당 하나 쓴다(AI 캡션 폐기, 08-19). 채널마다 다른 건 꼬리뿐이라
// 여기서 붙인다 — 복사 버튼(손으로 올리기)과 서버 게시(2단계)가 같은 함수를 써야 글이 같다.
//   스레드·X — 추적 링크(링크가 눌리는 곳). X는 해시태그 없음(09-25 조사).
//   인스타·유튜브 — 캡션·설명 링크가 안 눌려서 "링크는 프로필에" + 해시태그.
//                  인스타 해시태그 상한 5(09-25 조사), 유튜브는 #Shorts를 앞에.
// 해시태그 목록은 사람이 정한 고정값이다 — 바꾸려면 여기만 고치면 된다.
export const PROMO_HASHTAGS: Record<PromoLocale, string[]> = {
  en: ["#vibecoding", "#buildinpublic", "#indiehacker", "#aicoding", "#nookframe"],
  ko: ["#바이브코딩", "#사이드프로젝트", "#개발자", "#포트폴리오", "#nookframe"],
};
const LINK_IN_BIO: Record<PromoLocale, string> = {
  en: "Link in bio.",
  ko: "링크는 프로필에 있어요.",
};
const INSTAGRAM_HASHTAG_MAX = 5;

export function promoCaption({
  channel,
  caption,
  trackingUrl,
  locale,
}: {
  channel: string;
  caption: string | null;
  trackingUrl: string;
  locale: PromoLocale;
}): string {
  const body = (caption ?? "").trim();
  let tail: string;
  if (channel === "인스타") {
    tail = `${LINK_IN_BIO[locale]}\n\n${PROMO_HASHTAGS[locale].slice(0, INSTAGRAM_HASHTAG_MAX).join(" ")}`;
  } else if (channel === "유튜브") {
    tail = `${LINK_IN_BIO[locale]}\n\n${["#Shorts", ...PROMO_HASHTAGS[locale]].join(" ")}`;
  } else {
    tail = trackingUrl;
  }
  return [body, tail].filter(Boolean).join("\n\n");
}

// ── 예약 시각 ────────────────────────────────────────────────────────────
// 하루 1편, 채널마다 정해진 한국 시각에(사용자 09-25 결정). 한국은 서머타임이 없어
// UTC+9 고정으로 센다 — 미국 쪽 시각은 11/1 서머타임이 끝나면 한 시간 당겨진다.
//   en 11시 = 미국 동부 전날 밤 10시·서부 저녁 7시(09-25 조사: 릴스는 현지 저녁이 낫다)
//   ko 21시 = 한국 퇴근 뒤
export const PROMO_SLOT_HOUR_KST: Record<PromoLocale, number> = { en: 11, ko: 21 };
const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
// 누르자마자 올라가는 일이 없게 — 최소 이만큼 뒤의 칸부터 잡는다(마음 바꿀 틈).
export const PROMO_SCHEDULE_LEAD_MS = 30 * 60_000;

/** 한국 날짜 키(YYYY-MM-DD). */
export function kstDay(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 다음 빈 칸 — now+LEAD 이후 가장 이른 "한국 시각 hour시" 중, 이미 예약된 날(taken)이 아닌 첫날.
 * 가운데 예약을 취소하면 빈 날부터 다시 채운다.
 */
export function nextPromoSlot(nowMs: number, hourKst: number, takenMs: number[]): number {
  const taken = new Set(takenMs.map(kstDay));
  const earliest = nowMs + PROMO_SCHEDULE_LEAD_MS;
  const k = new Date(earliest + KST_OFFSET_MS);
  let slot = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), hourKst) - KST_OFFSET_MS;
  if (slot < earliest) slot += DAY_MS;
  while (taken.has(kstDay(slot))) slot += DAY_MS;
  return slot;
}

/** 화면 표시용 "9/26(금) 21:00". */
export function formatKstSlot(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${wd}) ${hh}:${mm}`;
}

// ── 포스트 상태 ──────────────────────────────────────────────────────────
// draft(링크만 복사) → queued(예약) → publishing(서버가 올리는 중, 2단계) → posted | failed.
// 손으로 올린 채널은 [올렸음]으로 바로 posted.
export type PromoPostStatus = "draft" | "queued" | "publishing" | "posted" | "failed";

