// 촬영 상태 판정(lib/filmingStatus.ts, 2026-10-02) — 네트워크 없음.
// 지키는 것: 외부 AI에게 "지금 어디까지 왔고 다음에 무슨 일이 일어나나"를 정직하게 말하기.
//  - 초안은 찍지 않는다고 말한다(공개 뒤 시작) · 몰아서 찍기면 "몇 시간" · 5분 넘으면 slow
//  - 실패는 실패 표의 같은 문장 + 원문(detail) · 보류 표시의 한국어 원문은 새지 않는다
//  - 대시보드 배지와 같은 "오래 걸림" 기준(DEMO_SLOW_MS)
import { filmingStatus, filmingSummary, FILMING_SLOW_MS, type FilmingRow } from "../lib/filmingStatus";
import { DEMO_SLOW_MS } from "../components/dashboard/projects/types";
import { MODERATION_HOLD_MARKER, CREDIT_HOLD_MARKER } from "../lib/demo-failure";
import { MCP_TOOL_NAMES } from "../lib/mcpTools";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const NOW = Date.parse("2026-10-02T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const row = (over: Partial<FilmingRow>): FilmingRow => ({
  is_draft: false,
  demo_build_status: null,
  demo_build_error: null,
  demo_video_url: null,
  demo_generated_at: null,
  demo_status_changed_at: null,
  demo_attempt_count: 0,
  video_url: null,
  ...over,
});
const run = (over: Partial<FilmingRow>, paused = false) => filmingStatus(row(over), { paused, nowMs: NOW });
const hangul = /[가-힣]/;

ok("대시보드 배지와 같은 '오래 걸림' 기준", FILMING_SLOW_MS === DEMO_SLOW_MS);
ok("원격 MCP 툴 목록에 get_nookframe_status", (MCP_TOOL_NAMES as readonly string[]).includes("get_nookframe_status"));

// 초안
{
  const f = run({ is_draft: true });
  ok("초안 = not-started", f.state === "not-started", f.state);
  ok("초안: 공개 뒤에 찍는다고 말한다", /publish/.test(f.next), f.next);
}
// 공개됐는데 요청 없음
{
  const f = run({ video_url: "https://media.nookframe.com/x.mp4" });
  ok("요청 없음 = no-auto-demo", f.state === "no-auto-demo");
  ok("주인 영상 주소는 ownerVideoUrl", f.ownerVideoUrl === "https://media.nookframe.com/x.mp4");
}
// 대기
{
  const f = run({ demo_build_status: "pending", demo_status_changed_at: ago(2) }, true);
  ok("대기 + 몰아서 찍기 = queued", f.state === "queued");
  ok("몰아서 찍기: 몇 시간 걸릴 수 있다고", /hours/.test(f.message), f.message);
  ok("몰아서 찍기: slow로 겁주지 않는다", f.slow === false);
  const g = run({ demo_build_status: "pending", demo_status_changed_at: ago(2) });
  ok("대기(정상 운영): 몇 분 안에", /few minutes/.test(g.message), g.message);
  const h = run({ demo_build_status: "pending", demo_status_changed_at: ago(30) });
  ok("대기 30분(정상 운영) = slow", h.slow && /longer than usual/.test(h.message), h.message);
  const old = run({ demo_build_status: "pending", demo_video_url: "https://media.nookframe.com/old.mp4" }, true);
  ok("다시 찍는 중이면 옛 영상이 걸려 있다고", /previous video stays/.test(old.message) && old.videoUrl === "https://media.nookframe.com/old.mp4");
}
// 진행 중
{
  const f = run({ demo_build_status: "recording", demo_status_changed_at: ago(1) });
  ok("촬영 중 = in-progress/filming", f.state === "in-progress" && f.stage === "filming", `${f.state}/${f.stage}`);
  ok("단계 번호 2/3", /step 2 of 3/.test(f.message), f.message);
  const g = run({ demo_build_status: "building", demo_status_changed_at: ago(12) }, true);
  ok("한 단계 12분 = slow(몰아서 찍기여도 — 이미 돌고 있다)", g.slow && /12 min/.test(g.message), g.message);
  ok("편집 단계", run({ demo_build_status: "editing" }).stage === "editing");
}
// 완료
{
  const f = run({
    demo_build_status: "done",
    demo_video_url: "https://media.nookframe.com/a.mp4",
    demo_generated_at: ago(60),
    demo_locale_videos: { en: "https://media.nookframe.com/a-en.mp4", ko: "javascript:alert(1)" },
  });
  ok("완료 = done + 영상 주소", f.state === "done" && f.videoUrl === "https://media.nookframe.com/a.mp4");
  ok("다른 언어 영상은 https만", JSON.stringify(f.otherLanguageVideos) === JSON.stringify({ en: "https://media.nookframe.com/a-en.mp4" }), JSON.stringify(f.otherLanguageVideos));
  const line = filmingSummary({ id: "abc", title: "Demo", isDraft: false }, f);
  ok("요약 한 줄에 상태·영상", /public · filming: done https:\/\/media/.test(line), line);
}
// 실패
{
  const f = run({ demo_build_status: "failed", demo_build_error: "[blank] page rendered nothing at step 3" });
  ok("실패 = failed + 코드", f.state === "failed" && f.failure?.code === "blank", f.failure?.code);
  ok("실패 원문은 detail로", f.failure?.detail === "page rendered nothing at step 3", f.failure?.detail);
  ok("실패: 재촬영 도구를 안내", /rerecord_nookframe_demo/.test(f.next));
  const g = run({ demo_build_status: "failed", demo_build_error: "x".repeat(2000) });
  ok("코드 없는 옛 실패 = error, 원문 500자 컷", g.failure?.code === "error" && g.failure.detail.length === 500);
}
// 보류 — 한국어 표시 원문이 새지 않는다
{
  const m = run({ demo_build_status: "held", demo_build_error: MODERATION_HOLD_MARKER });
  ok("검토 보류 = held, 검토 문장", m.state === "held" && /content check/.test(m.message), m.message);
  const c = run({ demo_build_status: "held", demo_build_error: CREDIT_HOLD_MARKER });
  ok("크레딧 보류 = held, '저절로 다시' 문장(승인 대기라고 하지 않음)", c.state === "held" && /resumes automatically/.test(c.message) && !/approval/.test(c.message), c.message);
  const q = run({ demo_build_status: "held", demo_build_error: null });
  ok("한도 보류 = held, 승인 대기 문장", q.state === "held" && /approval/.test(q.message), q.message);
  ok("보류 문장에 한국어 없음", !hangul.test(JSON.stringify(m)) && !hangul.test(JSON.stringify(c)));
}
// 대기 대본
{
  const f = run({ demo_build_status: "done", pending_demo_script: { steps: [] }, pending_script_at: ago(5), pending_script_note: "fixed step 3" });
  ok("대기 대본 = 주인이 눌러야 한다고", !!f.pendingScript && /presses re-record/.test(f.pendingScript.message));
  ok("대기 대본 메모", f.pendingScript?.note === "fixed step 3");
  ok("대기 대본 없으면 null", run({ demo_build_status: "done" }).pendingScript === null);
}
// 모든 상태 문장이 영어
{
  const all = ["pending", "building", "recording", "editing", "done", "failed", "held", null].map((s) =>
    run({ demo_build_status: s, demo_build_error: s === "failed" ? "[timeout] took too long" : null }),
  );
  ok("모든 상태 문장이 영어(AI가 읽는 표면)", all.every((f) => !hangul.test(f.message + f.next)));
}

if (failed) {
  console.log(`\n✗ ${failed}건 실패`);
  process.exit(1);
}
console.log("\n✓ 촬영 상태 판정 전부 통과");
