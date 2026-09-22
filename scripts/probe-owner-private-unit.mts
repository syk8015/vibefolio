// 대시보드 비공개 칸 합치기 규칙(2026-09-23, components/dashboard/projects/ownerPrivate.ts). 네트워크 없음.
//
// 지키는 것: 비공개 칸(대본·로그인 답·로봇 메모…)은 사용자 키로 못 읽어 서버 라우트로 따로
// 받는다. ① 공개 칸만 실린 행을 얹을 때 비공개 칸을 지우지 않는다 ② "서버에 다시 물을지"
// 판정 — 초안에 AI가 대본만 고쳐 보내면 공개 칸이 하나도 안 바뀐 UPDATE가 오는데, 이걸
// 놓치면 검토 창이 옛 대본을 보여 주고 다음 수정이 그 옛 대본으로 DB를 되돌린다.
import { mergeRow, mayTouchPrivate, applyPrivate, hasPrivate } from "../components/dashboard/projects/ownerPrivate";
import type { DBProject } from "../components/dashboard/projects/types";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const base = {
  id: "a", user_id: "u", title: "t", description: "d", type: "web", thumbnail: null, year: 2026,
  tags: ["x", "y"], demo_url: "https://e.com", comment: null, sort_order: 0, created_at: "2026-09-23",
  content_type: null, is_featured: false, video_url: null, demo_source_type: null, demo_build_status: null,
  demo_video_url: null, demo_generated_at: null, demo_attempt_count: 0, demo_status_changed_at: null,
  is_draft: true, pending_script_at: null, rerecord_self_used: false, target_device: null,
  demo_access: { url: "/demo" }, demo_user_hint: "메모", demo_script: { steps: [{ action: "click" }] },
  pending_demo_script: null, pending_script_note: null, demo_build_error: null, demo_source_value: null,
} as unknown as DBProject;
const publicOnly = (p: DBProject) => {
  const { demo_access, demo_user_hint, demo_script, pending_demo_script, pending_script_note, demo_build_error, demo_source_value, ...rest } = p;
  void demo_access; void demo_user_hint; void demo_script; void pending_demo_script; void pending_script_note; void demo_build_error; void demo_source_value;
  return rest;
};

// ① 얹기
const merged = mergeRow(base, { ...publicOnly(base), title: "새 제목" } as Partial<DBProject>);
ok("공개 칸만 얹어도 비공개 칸 유지", merged.title === "새 제목" && merged.demo_user_hint === "메모" && !!merged.demo_script);
ok("undefined 칸은 안 덮는다", mergeRow(base, { demo_user_hint: undefined } as Partial<DBProject>).demo_user_hint === "메모");
ok("새 행은 비공개 칸 null로 시작", mergeRow(undefined, publicOnly(base) as Partial<DBProject>).demo_script === null);
ok("hasPrivate: 공개 칸만이면 false", !hasPrivate(publicOnly(base)) && hasPrivate(base));
const same = [base];
ok("applyPrivate: 해당 없으면 같은 배열", applyPrivate(same, new Map()) === same);

// ② 다시 물을지 — 초안
const echo = { ...publicOnly(base), tags: [...(base.tags ?? [])] } as Partial<DBProject>; // realtime은 배열을 새로 보낸다
ok("초안: 공개 칸 변화 없음(대본만 고침) → 묻는다", mayTouchPrivate(base, echo));
ok("초안: 대표 지정만 → 안 묻는다", !mayTouchPrivate(base, { ...echo, is_featured: true }));
ok("초안: 순서만 → 안 묻는다", !mayTouchPrivate(base, { ...echo, sort_order: 3 }));
ok("초안: 제목 변화 → 묻는다", mayTouchPrivate(base, { ...echo, title: "x" }));
ok("페이로드에 비공개 칸이 실려 왔으면 안 묻는다", !mayTouchPrivate(base, { ...base, title: "x" }));
// 공개 작품
const pub = { ...base, is_draft: false } as DBProject;
const pubEcho = { ...publicOnly(pub), tags: [...(pub.tags ?? [])] } as Partial<DBProject>;
ok("공개: 아무 변화 없음 → 안 묻는다", !mayTouchPrivate(pub, pubEcho));
ok("공개: 대표 지정 → 안 묻는다", !mayTouchPrivate(pub, { ...pubEcho, is_featured: true }));
ok("공개: 촬영 상태 전이 → 묻는다", mayTouchPrivate(pub, { ...pubEcho, demo_build_status: "failed" }));
ok("공개: 새 대기 대본 → 묻는다", mayTouchPrivate(pub, { ...pubEcho, pending_script_at: "2026-09-23T01:00:00Z" }));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
