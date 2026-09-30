// 링크 순찰 판정(네트워크 없음) — lib/linkPatrol.ts.
// 사용: `npx -y tsx scripts/probe-link-patrol-unit.mts`
//
// 무엇을 보나: (1) 순찰 대상(외부 http만, 업로드·GitHub 제외) (2) 죽음으로 세는 상태 코드
// (봇 차단 401·403·429는 살아 있음) (3) meta refresh 목적지 (4) 판정 — 처음 본 사이트가 기준,
// 딴 사이트로 넘기면 moved, 3일 연달아 실패해야 dead, 위험이 가장 앞, 주소가 바뀌면 기록 초기화
// (5) 이번 틱에 볼 행 — 주소가 바뀐 행 먼저, 하루 안 된 행은 건너뜀.
import {
  patrollableUrl, isDeadStatus, metaRefreshTarget, decideLinkState, pickDue, LINK_DEAD_AFTER_MS,
} from "../lib/linkPatrol";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// (1)
ok("외부 https는 대상", patrollableUrl("https://a.com/x"));
ok("업로드(/api/preview)는 제외", !patrollableUrl("/api/preview/u/r/index.html"));
ok("GitHub 저장소는 제외", !patrollableUrl("https://github.com/a/b") && !patrollableUrl("https://www.github.com/a/b"));
ok("GitHub Pages(github.io)는 대상", patrollableUrl("https://a.github.io/app"));
ok("빈 값·이상한 값 제외", !patrollableUrl(null) && !patrollableUrl("javascript:alert(1)") && !patrollableUrl("ftp://a.com"));

// (2)
for (const s of [404, 410, 500, 502, 503]) ok(`HTTP ${s} = 안 열림`, isDeadStatus(s));
for (const s of [200, 301, 401, 403, 405, 429]) ok(`HTTP ${s} = 살아 있음`, !isDeadStatus(s));

// (3)
ok("meta refresh 절대 주소", metaRefreshTarget(`<meta http-equiv="refresh" content="0; url=https://evil.com/x">`, "https://a.com/") === "https://evil.com/x");
ok("meta refresh 상대 주소", metaRefreshTarget(`<META HTTP-EQUIV=Refresh CONTENT="5;URL='/next'">`, "https://a.com/p/") === "https://a.com/next");
ok("meta refresh 없음", metaRefreshTarget(`<meta name="viewport" content="width=device-width">`, "https://a.com/") === null);
ok("meta refresh javascript: 무시", metaRefreshTarget(`<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`, "https://a.com/") === null);

// (4)
const now = Date.parse("2026-09-30T00:00:00Z");
const fresh = { checkedUrl: null, baselineHost: null, failSince: null };
const same = (url: string, baselineHost: string | null, failSince: string | null = null) => ({ checkedUrl: url, baselineHost, failSince });
const U = "https://myapp.vercel.app/";
{
  const d = decideLinkState({ demoUrl: U, prev: fresh, obs: { ok: true, finalUrl: "https://myapp.com/" }, threat: null, now });
  ok("처음 본 도착지가 기준(원래 커스텀 도메인으로 넘기는 앱은 정상)", d.state === null && d.baselineHost === "myapp.com");
}
{
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com"), obs: { ok: true, finalUrl: "https://evil.com/login" }, threat: null, now });
  ok("기준과 다른 사이트로 넘기면 moved + 호스트", d.state === "moved" && d.detail === "evil.com");
}
{
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com"), obs: { ok: true, finalUrl: "https://www.myapp.com/app" }, threat: null, now });
  ok("www·하위 경로는 같은 사이트", d.state === null);
}
{
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com"), obs: { ok: true, finalUrl: "https://myapp.vercel.app/" }, threat: null, now });
  ok("넘기기를 멈추고 원래 주소에 머물러도 정상", d.state === null);
}
{
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com"), obs: { ok: false, reason: "HTTP 404" }, threat: null, now });
  ok("첫 실패는 아직 dead 아님 + 실패 시작 기록", d.state === null && d.failSince === new Date(now).toISOString());
}
{
  const since = new Date(now - LINK_DEAD_AFTER_MS + 60_000).toISOString();
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com", since), obs: { ok: false, reason: "HTTP 404" }, threat: null, now });
  ok("3일 안 됐으면 아직 dead 아님", d.state === null && d.failSince === since);
}
{
  const since = new Date(now - LINK_DEAD_AFTER_MS).toISOString();
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com", since), obs: { ok: false, reason: "timeout" }, threat: null, now });
  ok("3일 연달아 실패면 dead", d.state === "dead" && d.detail === "timeout");
}
{
  const since = new Date(now - LINK_DEAD_AFTER_MS).toISOString();
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com", since), obs: { ok: true, finalUrl: U }, threat: null, now });
  ok("다시 열리면 실패 기록 지움", d.state === null && d.failSince === null);
}
{
  const d = decideLinkState({ demoUrl: U, prev: same(U, "myapp.com"), obs: { ok: true, finalUrl: "https://evil.com/" }, threat: "SOCIAL_ENGINEERING", now });
  ok("위험이 넘김보다 앞", d.state === "unsafe" && d.detail === "SOCIAL_ENGINEERING");
}
{
  const d = decideLinkState({ demoUrl: "https://new.com/", prev: same(U, "myapp.com", new Date(0).toISOString()), obs: { ok: true, finalUrl: "https://new.com/" }, threat: null, now });
  ok("주소가 바뀌면 옛 기준·실패 기록 버림", d.state === null && d.baselineHost === "new.com" && d.failSince === null);
}

// (5)
const row = (id: string, demo: string, checkedUrl: string | null, checkedAt: string | null) => ({
  id, demo_url: demo, link_state: null, link_state_detail: null, link_checked_url: checkedUrl,
  link_checked_at: checkedAt, link_baseline_host: null, link_fail_since: null,
});
{
  const hourAgo = new Date(now - 3_600_000).toISOString();
  const twoDays = new Date(now - 48 * 3_600_000).toISOString();
  const threeDays = new Date(now - 72 * 3_600_000).toISOString();
  const due = pickDue([
    row("recent", "https://a.com", "https://a.com", hourAgo),
    row("old2", "https://b.com", "https://b.com", twoDays),
    row("old3", "https://c.com", "https://c.com", threeDays),
    row("changed", "https://d2.com", "https://d.com", hourAgo),
    row("new", "https://e.com", null, null),
  ], now, 4);
  ok("주소 바뀐·처음 보는 행 먼저, 그다음 오래된 순, 1시간 전 본 행은 건너뜀",
    due.map((r) => r.id).join(",") === "changed,new,old3,old2", due.map((r) => r.id).join(","));
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall link-patrol unit probes passed");
process.exit(failed ? 1 : 0);
