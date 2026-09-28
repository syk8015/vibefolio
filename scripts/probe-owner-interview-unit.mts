// 주인 인터뷰 판정(2026-09-29, 필수 게이트) — lib/ownerInterview.ts. 네트워크 없음.
// 지키는 것: 주인의 답 3개가 다 있어야 통과하고, "없음"·"N/A" 같은 자리 채우기는 빈 답으로 본다
// (주인에게 묻지 않고 AI가 메운 흔적). 가릴 것은 배열이든 쉼표 글이든 받고, 공개 칸이 아닌
// 비공개 칸으로 가는지는 probe-project-columns가 본다. 서버 게이트·초안 검토 창이 이 함수 하나를 쓴다.
import {
  normalizeOwnerInterview, normalizeHideList, readOwnerInterview,
  OWNER_ANSWER_MAX, OWNER_HIDE_ITEM_MAX, OWNER_HIDE_MAX_ITEMS,
} from "../lib/ownerInterview";
import { PRIVATE_PROJECT_COLUMNS, PUBLIC_PROJECT_COLUMNS } from "../lib/projectColumns";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const good = { proudMoment: "낭비 요약 화면", howIUse: "월요일마다 돌려 봐요", mustSee: "3% 대 12%" };

// 통과
{
  const r = normalizeOwnerInterview(good);
  ok("답 3개 → 통과, hide는 빈 목록", !r.issue && r.value?.hide.length === 0, JSON.stringify(r));
}
{
  const r = normalizeOwnerInterview({ ...good, hide: ["금액", "폴더 경로"] });
  ok("hide 배열 → 그대로", r.value?.hide.join("|") === "금액|폴더 경로");
}
{
  const r = normalizeOwnerInterview({ ...good, hide: "금액, 폴더 경로\n사람 이름" });
  ok("hide 쉼표·줄바꿈 글 → 목록", r.value?.hide.join("|") === "금액|폴더 경로|사람 이름", JSON.stringify(r.value?.hide));
}
{
  const r = normalizeOwnerInterview({ ...good, hide: "없음" });
  ok('hide "없음" → 빈 목록', r.value?.hide.length === 0);
}
{
  const r = normalizeOwnerInterview({ proudMoment: "  여러   칸\n 공백  ", howIUse: "a b", mustSee: "c" });
  ok("공백 정리", r.value?.proudMoment === "여러 칸 공백", JSON.stringify(r.value));
}

// 거절 — 칸 자체가 없음
for (const raw of [undefined, null, "문자열", [], 3]) {
  const r = normalizeOwnerInterview(raw);
  ok(`${JSON.stringify(raw)} → missing`, r.issue?.kind === "missing");
}

// 거절 — 답이 빠짐(자리 채우기 포함)
{
  const r = normalizeOwnerInterview({ proudMoment: "x", howIUse: "" });
  ok("빈 답 → incomplete(빠진 칸 이름)", r.issue?.kind === "incomplete" && r.issue.keys.join(",") === "howIUse,mustSee", JSON.stringify(r.issue));
}
for (const filler of ["N/A", "none", "TBD", "-", "...", "없음", "모름", "미정", "해당 없음", "?"]) {
  const r = normalizeOwnerInterview({ ...good, mustSee: filler });
  ok(`자리 채우기 ${JSON.stringify(filler)} → incomplete`, r.issue?.kind === "incomplete");
}
{
  const r = normalizeOwnerInterview({ ...good, mustSee: "none of the settings pages" });
  ok('"none"으로 시작하는 진짜 답은 통과', !r.issue);
}

// 거절 — 너무 긺
{
  const r = normalizeOwnerInterview({ ...good, howIUse: "가".repeat(OWNER_ANSWER_MAX + 1) });
  ok(`답 ${OWNER_ANSWER_MAX + 1}자 → too-long`, r.issue?.kind === "too-long" && r.issue.key === "howIUse");
}
{
  const r = normalizeOwnerInterview({ ...good, howIUse: "가".repeat(OWNER_ANSWER_MAX) });
  ok(`답 ${OWNER_ANSWER_MAX}자 → 통과`, !r.issue);
}
{
  const r = normalizeOwnerInterview({ ...good, hide: ["x".repeat(OWNER_HIDE_ITEM_MAX + 1)] });
  ok("가릴 것 한 항목이 너무 긺 → too-long(hide)", r.issue?.kind === "too-long" && r.issue.key === "hide");
}

// 가릴 것 목록 규칙
{
  const many = Array.from({ length: 20 }, (_, i) => `item${i}`);
  const h = normalizeHideList(many);
  ok(`가릴 것 최대 ${OWNER_HIDE_MAX_ITEMS}개`, Array.isArray(h) && h.length === OWNER_HIDE_MAX_ITEMS);
  const d = normalizeHideList(["금액", "금액", " 금액 ", "Amount", "amount"]);
  ok("가릴 것 중복 제거(대소문자 무시)", Array.isArray(d) && d.join("|") === "금액|Amount", JSON.stringify(d));
  ok("가릴 것 형식 밖 값 → 빈 목록", JSON.stringify(normalizeHideList({ a: 1 })) === "[]");
}

// DB 값 읽기 — 형식이 어긋나면 null(옛 초안과 같게)
ok("readOwnerInterview(정상)", readOwnerInterview({ ...good, hide: [] })?.mustSee === "3% 대 12%");
ok("readOwnerInterview(null) → null", readOwnerInterview(null) === null);
ok("readOwnerInterview(깨진 값) → null", readOwnerInterview({ proudMoment: "x" }) === null);

// 비공개 칸으로 간다(가릴 것 목록이 들어 있다)
ok("owner_interview는 PRIVATE", (PRIVATE_PROJECT_COLUMNS as readonly string[]).includes("owner_interview"));
ok("owner_interview_confirmed_at는 PRIVATE", (PRIVATE_PROJECT_COLUMNS as readonly string[]).includes("owner_interview_confirmed_at"));
ok("둘 다 PUBLIC에는 없다", !(PUBLIC_PROJECT_COLUMNS as readonly string[]).some((c) => c.startsWith("owner_interview")));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
