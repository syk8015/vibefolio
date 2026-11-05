// 매일 밈 5단계 — 공개한 줄을 홈 모양으로 바꾸는 순수 규칙(lib/memeLiveShape.ts). 네트워크 없음. `npm test`에 연결.
import assert from "node:assert/strict";
import { applyOverrides, applyOverridesToStrings, shapeLiveMemes } from "../lib/memeLiveShape";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`✓ ${name}`); };

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const row = (over: Record<string, unknown>) => ({
  text: "x", reply: null, audience: "logged_in", kind: "new", replaces: null, reviewed_at: ago(1), ...over,
}) as Parameters<typeof shapeLiveMemes>[0][number];

t("하루 안에 공개한 줄은 '오늘', 그 전 것은 나머지 — 답글 없으면 reply 칸 없음", () => {
  const r = shapeLiveMemes([row({ text: "new", reviewed_at: ago(2) }), row({ text: "old", reply: "r", reviewed_at: ago(30) })], NOW);
  assert.deepEqual(r.fresh, [{ text: "new" }]);
  assert.deepEqual(r.rest, [{ text: "old", reply: "r" }]);
});

t("로그아웃 홈엔 '모두에게' 줄만, 오늘 것이 앞", () => {
  const r = shapeLiveMemes([
    row({ text: "a", audience: "everyone", reviewed_at: ago(40) }),
    row({ text: "b", audience: "logged_in" }),
    row({ text: "c", audience: "everyone", reviewed_at: ago(3) }),
  ], NOW);
  assert.deepEqual(r.everyone.map((l) => l.text), ["c", "a"]);
});

t("최신화는 새 줄로 안 세고 기존 문구를 갈아 끼움 — 같은 문구를 두 번 고치면 나중 것", () => {
  const r = shapeLiveMemes([
    row({ kind: "refresh", replaces: "Old line", text: "Second", reviewed_at: ago(2) }),
    row({ kind: "refresh", replaces: "Old line", text: "First", reviewed_at: ago(20) }),
  ], NOW);
  assert.equal(r.fresh.length + r.rest.length, 0);
  assert.deepEqual(r.overrides["Old line"], { text: "Second" });
  assert.deepEqual(applyOverrides([{ text: "Old line", reply: "gone" }, { text: "Keep" }], r.overrides), [{ text: "Second" }, { text: "Keep" }]);
  assert.deepEqual(applyOverridesToStrings(["Old line", "Keep"], r.overrides), [{ text: "Second" }, { text: "Keep" }]);
});

t("공개 시각이 없으면 '오늘'로 치지 않음", () => {
  assert.equal(shapeLiveMemes([row({ reviewed_at: null })], NOW).fresh.length, 0);
});

console.log(`\n${n} checks passed`);
