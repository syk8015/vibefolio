// 홍보 예약 대기열 순수 규칙(lib/promo.ts) — 네트워크 없음. `npm test`에 연결.
// 채널 고르기(피드 언어) · 하루 1편 칸 잡기(한국 시각) · 채널별 캡션 꼬리.
import assert from "node:assert/strict";
import {
  PROMO_SCHEDULE_LEAD_MS, formatKstSlot, kstDay, nextPromoSlot, promoCaption, promoScheduleChannels,
} from "../lib/promo";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`✓ ${name}`); };
const kst = (s: string) => Date.parse(`${s}+09:00`);

t("채널: 영어 클립=인스타, 한국어 클립=스레드(유튜브는 심사 전·X는 손으로라 빠짐)", () => {
  assert.deepEqual(promoScheduleChannels("en"), ["인스타"]);
  assert.deepEqual(promoScheduleChannels("ko"), ["스레드"]);
});

t("한국 날짜: 자정 경계", () => {
  assert.equal(kstDay(kst("2026-09-26T00:00:00")), "2026-09-26");
  assert.equal(kstDay(kst("2026-09-25T23:59:59")), "2026-09-25");
});

t("칸: 오늘 칸이 여유(30분) 뒤면 오늘, 아니면 내일", () => {
  assert.equal(nextPromoSlot(kst("2026-09-25T10:00:00"), 11, []), kst("2026-09-25T11:00:00"));
  assert.equal(nextPromoSlot(kst("2026-09-25T10:45:00"), 11, []), kst("2026-09-26T11:00:00"));
  assert.equal(nextPromoSlot(kst("2026-09-25T23:50:00"), 21, []), kst("2026-09-26T21:00:00"));
  // 여유는 정확히 30분까지 허용
  assert.equal(nextPromoSlot(kst("2026-09-25T11:00:00") - PROMO_SCHEDULE_LEAD_MS, 11, []), kst("2026-09-25T11:00:00"));
});

t("칸: 하루 1편 — 잡힌 날은 건너뛰고, 가운데 빈 날부터 채운다", () => {
  const now = kst("2026-09-25T09:00:00");
  const taken = [kst("2026-09-25T21:00:00"), kst("2026-09-27T21:00:00")];
  assert.equal(nextPromoSlot(now, 21, taken), kst("2026-09-26T21:00:00"));
  // 손으로 올린 날(다른 시각)도 그날로 친다
  assert.equal(nextPromoSlot(now, 21, [kst("2026-09-25T13:12:00")]), kst("2026-09-26T21:00:00"));
  // 달 넘김
  assert.equal(nextPromoSlot(kst("2026-09-30T22:00:00"), 21, []), kst("2026-10-01T21:00:00"));
});

t("표시: 한국 시각 요일", () => {
  assert.equal(formatKstSlot(kst("2026-09-26T21:00:00")), "9/26(토) 21:00");
});

const url = "https://nookframe.com/?utm_source=x&utm_campaign=promo-1";
t("꼬리: 스레드·X = 추적 링크, 해시태그 없음", () => {
  for (const channel of ["스레드", "X"]) {
    const out = promoCaption({ channel, caption: " 본문 ", trackingUrl: url, locale: "ko" });
    assert.equal(out, `본문\n\n${url}`);
    assert.ok(!out.includes("#"));
  }
});
t("꼬리: 인스타 = 링크는 프로필에 + 해시태그 5개 이하, 링크 없음", () => {
  const out = promoCaption({ channel: "인스타", caption: "Hello", trackingUrl: url, locale: "en" });
  assert.ok(out.startsWith("Hello\n\nLink in bio."));
  assert.ok(!out.includes("http"));
  assert.ok((out.match(/#\S+/g) ?? []).length <= 5);
});
t("꼬리: 유튜브 = #Shorts 먼저", () => {
  const out = promoCaption({ channel: "유튜브", caption: "Hi", trackingUrl: url, locale: "en" });
  assert.match(out, /\n\n#Shorts /);
  assert.ok(!out.includes("http"));
});
t("꼬리: 캡션이 비면 꼬리만(빈 줄로 시작 안 함)", () => {
  assert.equal(promoCaption({ channel: "스레드", caption: null, trackingUrl: url, locale: "ko" }), url);
});

console.log(`\n${n} checks passed`);
