// 매일 밈 후보 검사 순수 규칙(lib/memeSubmit.ts) — 네트워크 없음. `npm test`에 연결.
import assert from "node:assert/strict";
import { MEME_JSON_FIELD_MAX, MEME_MAX_LINES, memeKey, parseMemeSubmission } from "../lib/memeSubmit";
import { MEME_TRANSITIONS, kstDay, parseMemeReview } from "../lib/memeReview";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`✓ ${name}`); };

const run = { run_date: "2026-11-05", status: "ok" };
const line = (over: Record<string, unknown> = {}) => ({
  lang: "en", audience: "logged_in", kind: "new", text: "Shipped it. Told no one",
  sensitivity: { level: "green" }, sensitivity_score: 5, ...over,
});
const bad = (body: unknown, field: string) => {
  const r = parseMemeSubmission(body);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.field, field);
};

t("정상: 줄 하나 → 그대로, 상태 칸은 받지 않음", () => {
  const r = parseMemeSubmission({ run, lines: [line({ status: "approved" })] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.lines.length, 1);
    assert.equal("status" in r.lines[0], false);
    assert.equal(r.lines[0].reply, null);
  }
});

t("실행 기록: 날짜 형식·없는 날짜·상태", () => {
  bad({ run: { ...run, run_date: "2026-13-01" } }, "run.run_date");
  bad({ run: { ...run, run_date: "2026-11-5" } }, "run.run_date");
  bad({ run: { ...run, status: "approved" } }, "run.status");
  bad({ lines: [] }, "run");
});

t("건너뜀·실패는 까닭이 있어야 하고 줄을 못 싣는다", () => {
  bad({ run: { ...run, status: "skipped" } }, "run.reason");
  bad({ run: { ...run, status: "failed", reason: "x" }, lines: [line()] }, "lines");
  assert.ok(parseMemeSubmission({ run: { ...run, status: "skipped", reason: "weekly limit 72%" } }).ok);
});

t("글: 한 줄·1~120자·제어/방향 문자 거절, 앞뒤 공백은 다듬음", () => {
  bad({ run, lines: [line({ text: "two\nlines" })] }, "lines[0].text");
  bad({ run, lines: [line({ text: "x".repeat(121) })] }, "lines[0].text");
  bad({ run, lines: [line({ text: "   " })] }, "lines[0].text");
  bad({ run, lines: [line({ text: "abc‮def" })] }, "lines[0].text");
  bad({ run, lines: [line({ reply: "a\tb" })] }, "lines[0].reply");
  const r = parseMemeSubmission({ run, lines: [line({ text: "  hi  " })] });
  assert.ok(r.ok && r.lines[0].text === "hi");
});

t("종류·대상·언어는 정해진 값만, 최신화는 바꿀 문구가 있어야", () => {
  bad({ run, lines: [line({ lang: "ja" })] }, "lines[0].lang");
  bad({ run, lines: [line({ audience: "all" })] }, "lines[0].audience");
  bad({ run, lines: [line({ kind: "refresh" })] }, "lines[0].replaces");
  assert.ok(parseMemeSubmission({ run, lines: [line({ kind: "refresh", replaces: "Opens ChatGPT before Stack Overflow" })] }).ok);
});

t("민감도 검사는 빠질 수 없다 — 근거와 0~100 정수 점수", () => {
  bad({ run, lines: [line({ sensitivity: undefined })] }, "lines[0].sensitivity");
  bad({ run, lines: [line({ sensitivity_score: 101 })] }, "lines[0].sensitivity_score");
  bad({ run, lines: [line({ sensitivity_score: 4.5 })] }, "lines[0].sensitivity_score");
  bad({ run, lines: [line({ sensitivity_score: "5" })] }, "lines[0].sensitivity_score");
});

t("근거 칸 크기 상한·배열 거절, 줄 수 상한", () => {
  bad({ run, lines: [line({ trend: { x: "y".repeat(MEME_JSON_FIELD_MAX) } })] }, "lines[0].trend");
  bad({ run, lines: [line({ source: ["a"] })] }, "lines[0].source");
  bad({ run, lines: Array.from({ length: MEME_MAX_LINES + 1 }, (_, i) => line({ text: `l${i}` })) }, "lines");
});

t("겹침 열쇠: 답글까지 같아야 같은 줄", () => {
  assert.equal(memeKey({ lang: "en", text: "a", reply: null }), memeKey({ lang: "en", text: "a", reply: null }));
  assert.notEqual(memeKey({ lang: "en", text: "a", reply: "b" }), memeKey({ lang: "en", text: "a", reply: null }));
  assert.notEqual(memeKey({ lang: "ko", text: "a", reply: null }), memeKey({ lang: "en", text: "a", reply: null }));
});

const ID = "4b3c2a10-1111-4222-8333-944455556666";
t("검토: 동작과 상태 이동 — 공개·버림은 대기에서만, 내림은 공개에서만, 되돌리기는 버림·내림에서만", () => {
  assert.deepEqual(MEME_TRANSITIONS.publish, { from: ["pending"], to: "approved" });
  assert.deepEqual(MEME_TRANSITIONS.drop, { from: ["pending"], to: "rejected" });
  assert.deepEqual(MEME_TRANSITIONS.retire, { from: ["approved"], to: "retired" });
  assert.deepEqual(MEME_TRANSITIONS.restore, { from: ["rejected", "retired"], to: "pending" });
});

t("검토: 잘못된 id·동작은 거절, 상태를 직접 보내도 받지 않음", () => {
  assert.equal(parseMemeReview({ id: "x", op: "publish" }).ok, false);
  assert.equal(parseMemeReview({ id: ID, op: "approve" }).ok, false);
  const r = parseMemeReview({ id: ID, op: "drop", status: "approved" });
  assert.ok(r.ok && r.op === "drop" && r.edit === null);
});

t("검토: 고친 글은 공개에만, 한 줄 120자, 빈 답글은 답글 없음", () => {
  assert.equal(parseMemeReview({ id: ID, op: "drop", text: "x" }).ok, false);
  assert.equal(parseMemeReview({ id: ID, op: "publish", text: "a\nb" }).ok, false);
  assert.equal(parseMemeReview({ id: ID, op: "publish", text: "x".repeat(121) }).ok, false);
  const r = parseMemeReview({ id: ID, op: "publish", text: "  Shipped it  ", reply: "" });
  assert.ok(r.ok && r.edit?.text === "Shipped it" && r.edit.reply === null);
});

t("검토: 한국 날짜", () => {
  assert.equal(kstDay(Date.parse("2026-11-05T00:30:00+09:00")), "2026-11-05");
});

console.log(`\n${n} checks passed`);
