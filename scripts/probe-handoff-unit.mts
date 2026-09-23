// 폰 → 컴퓨터 넘기기 순수 규칙(lib/handoff.ts) — 네트워크 없음. `npm test`에 연결.
import assert from "node:assert/strict";
import {
  normalizeHandoffEmail, isHandoffId, sanitizeTouch, shouldRemind, handoffLink,
  REMIND_AFTER_MS, REMIND_BEFORE_MS,
} from "../lib/handoff";
import { handoffEmail } from "../lib/email-templates";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`✓ ${name}`); };

t("이메일: 소문자·공백 정리", () => assert.equal(normalizeHandoffEmail("  Hi@Ex.COM "), "hi@ex.com"));
t("이메일: 모양 틀리면 null", () => {
  for (const v of ["", "a@b", "no at", 3, null, "x".repeat(250) + "@a.co"]) assert.equal(normalizeHandoffEmail(v), null);
});
t("id: uuid만", () => {
  assert.ok(isHandoffId("0b6c1b4e-3f7a-4c1e-9a55-2b1d9d2f8a10"));
  assert.ok(!isHandoffId("1; drop table"));
  assert.ok(!isHandoffId(undefined));
});
t("first-touch: 모르는 칸 버림·길이 자름·빈 것은 null", () => {
  const out = sanitizeTouch({ utm_source: "reel", evil: "x", referrer: "r".repeat(1000) });
  assert.equal(out?.utm_source, "reel");
  assert.equal(out?.referrer?.length, 300);
  assert.ok(!("evil" in (out ?? {})));
  assert.equal(sanitizeTouch({ utm_source: "" }), null);
  assert.equal(sanitizeTouch([1]), null);
  assert.equal(sanitizeTouch("x"), null);
});
t("알림: 동의·안 열림·안 보냄·20~44시간 안에서만", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();
  const base = { remind: true, opened_at: null, reminded_at: null, created_at: at(24 * 3600e3) };
  assert.equal(shouldRemind(base, now), true);
  assert.equal(shouldRemind({ ...base, remind: false }, now), false);
  assert.equal(shouldRemind({ ...base, opened_at: at(1000) }, now), false);
  assert.equal(shouldRemind({ ...base, reminded_at: at(1000) }, now), false);
  assert.equal(shouldRemind({ ...base, created_at: at(REMIND_AFTER_MS - 1) }, now), false);
  assert.equal(shouldRemind({ ...base, created_at: at(REMIND_BEFORE_MS + 1) }, now), false);
});
t("링크: 이메일을 싣지 않는다", () => {
  const l = handoffLink("https://nookframe.com", "0b6c1b4e-3f7a-4c1e-9a55-2b1d9d2f8a10");
  assert.equal(l, "https://nookframe.com/signup?h=0b6c1b4e-3f7a-4c1e-9a55-2b1d9d2f8a10");
  assert.ok(!l.includes("@"));
});
t("메일: 첫 메일은 '요청 안 했으면 무시', 알림은 '마지막'", () => {
  const link = "https://nookframe.com/signup?h=x";
  for (const locale of ["ko", "en"] as const) {
    const first = handoffEmail({ link, locale });
    const rem = handoffEmail({ link, locale, reminder: true });
    assert.ok(first.html.includes(link) && rem.html.includes(link));
    assert.notEqual(first.subject, rem.subject);
  }
  assert.ok(handoffEmail({ link, locale: "en" }).html.includes("Didn&#39;t ask for this?"));
  assert.ok(handoffEmail({ link, locale: "en", reminder: true }).html.includes("only reminder"));
});

console.log(`\nhandoff unit: ${n} passed`);
