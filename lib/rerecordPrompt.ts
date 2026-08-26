import type { DemoScript } from "@/lib/demoScript";
import { loginCommand } from "@/lib/connectSnippets";

// 재촬영 프롬프트 (2026-08-25 사용자 확정 설계).
//
// 사람은 완성된 영상을 보고 **말로** 불만을 적는다("16초에서 그거 클릭하지 마",
// "이 기능이 빠졌어"). 대본을 다시 쓰는 건 AI 몫이다 — 사람이 CSS 셀렉터를 손으로
// 만지는 제품은 만들지 않기로 했다.
//
// 이 프롬프트의 유일한 설계 요구: **재촬영은 새 세션의 AI가 맡을 수 있다.** 그
// 세션엔 원래 발행 때의 대화도, 레포 탐색 기억도 없다. 그래서 여기에 맥락을 통째로
// 싣는다 — 작품 정보·현재 대본 전문·사람의 수정 요청·형식 규칙·제출 방법·토큰까지.
// 프롬프트 하나만 붙여넣으면 일이 끝나야 한다.

export interface RerecordContext {
  projectId: string;
  title: string;
  description: string;
  /** 로봇이 실제로 여는 주소(appUrl 우선으로 이미 확정된 값) */
  demoUrl: string;
  contentType: string | null;
  tags: string[];
  /** 로그인 없이 데모를 보는 방법 — 있으면 새 AI가 그대로 써야 한다 */
  demoAccess: unknown;
  /** 지금 걸려 있는 대본(= 이번 영상이 찍힌 근거) */
  currentScript: DemoScript | null;
  /** 사람이 영상을 보고 적은 수정 요청 원문 */
  note: string;
}

const SHAPE = `{
  "steps": [
    {
      "goal": "이 비트가 증명하는 것 (120자 이내)",
      "selector": "그 컨트롤의 CSS 셀렉터 — 코드를 아는 네가 정확한 걸 줘라",
      "toSelector": "(action=drag일 때) 놓을 곳의 CSS 셀렉터",
      "where": "눈으로 찾는 법(보이는 라벨·위치) — 셀렉터가 빗나갔을 때의 폴백",
      "action": "click | type | drag | scroll | hover | draw | focus",
      "text": "(action=type) 입력할 내용",
      "expect": "하고 나면 화면에 나타나야 하는 것",
      "hold": 2
    }
  ],
  "skip": ["모든 앱에 다 있어서 비트가 아까운 것들 — 예: 다크 모드 토글"],
  "prep": "(선택) 투어 전 준비 한 줄"
}`;

const SHAPE_EN = SHAPE
  .replace('"이 비트가 증명하는 것 (120자 이내)"', '"what this beat proves (max 120 chars)"')
  .replace('"그 컨트롤의 CSS 셀렉터 — 코드를 아는 네가 정확한 걸 줘라"', '"the control\'s CSS selector — you know the code, give the exact one"')
  .replace('"(action=drag일 때) 놓을 곳의 CSS 셀렉터"', '"(action=drag) CSS selector of the drop target"')
  .replace('"눈으로 찾는 법(보이는 라벨·위치) — 셀렉터가 빗나갔을 때의 폴백"', '"how to find it by eye (visible label/position) — the fallback when a selector misses"')
  .replace('"(action=type) 입력할 내용"', '"(action=type) what to type"')
  .replace('"하고 나면 화면에 나타나야 하는 것"', '"what the screen should show right after"')
  .replace('"모든 앱에 다 있어서 비트가 아까운 것들 — 예: 다크 모드 토글"', '"things NOT worth a beat because every app has them — e.g. a dark-mode toggle"')
  .replace('"(선택) 투어 전 준비 한 줄"', '"(optional) one setup line before the tour"');

function facts(c: RerecordContext, locale: "ko" | "en"): string {
  const none = locale === "en" ? "(none)" : "(없음)";
  const L = locale === "en"
    ? { id: "Project id (you need it to submit)", title: "Title", desc: "Description", url: "URL the robot opens", kind: "Category", tools: "Built with", access: "How to view without logging in (demoAccess)" }
    : { id: "프로젝트 id (제출할 때 필요)", title: "제목", desc: "설명", url: "로봇이 여는 주소", kind: "분류", tools: "만든 도구", access: "로그인 없이 보는 법(demoAccess)" };
  const lines = [
    `- ${L.id}: ${c.projectId}`,
    `- ${L.title}: ${c.title || none}`,
    `- ${L.desc}: ${c.description || none}`,
    `- ${L.url}: ${c.demoUrl || none}`,
    `- ${L.kind}: ${c.contentType ?? none} · ${L.tools}: ${c.tags.length ? c.tags.join(", ") : none}`,
  ];
  if (c.demoAccess) lines.push(`- ${L.access}: ${JSON.stringify(c.demoAccess)}`);
  return lines.join("\n");
}

export function rerecordPrompt(
  origin: string,
  c: RerecordContext,
  locale: "ko" | "en" = "ko",
  token?: string,
): string {
  const tokenArg =
    token ??
    (locale === "en"
      ? "<a fresh token is filled in here when you press copy>"
      : "<복사 버튼을 누르면 새 토큰이 여기 자동으로 채워져요>");
  const current = c.currentScript
    ? JSON.stringify(c.currentScript, null, 2)
    : (locale === "en" ? "(none — this film was shot without a script)" : "(없음 — 이 영상은 대본 없이 찍혔다)");
  const submitUrl = `${origin.replace(/\/$/, "")}/api/ingest/rerecord/${c.projectId}`;

  if (locale === "en") {
    return `Rewrite the filming script for a Nookframe auto-demo. You built this project; the owner watched the current film and told us what to fix.

WHAT WENT WRONG (the owner's own words — this is the whole point of the job):
"""
${c.note}
"""

THE PROJECT
${facts(c, "en")}

THE SCRIPT THAT PRODUCED THE CURRENT FILM (fix THIS — keep what works, change what the owner complained about):
\`\`\`json
${current}
\`\`\`

RULES (the robot follows the script literally)
- Your script IS the film: the robot shoots exactly these steps, in order, then stops.
- 3 steps minimum, 5–8 is the sweet spot, 10 max. Order = importance; the film is ~30s and gets cut from the END.
- Give a real CSS "selector" for EVERY step — when all steps carry one (and drags carry toSelector, types carry text), the robot skips its vision pass and frames straight from the DOM: faster, cheaper, pixel-exact. "where" is only the fallback.
- "hold" (0.5–4s) keeps that step's result on screen; "focus" magnifies an area without touching it.
- The robot never logs in, submits, deletes, or opens file pickers — don't ask it to.
- Re-check the live page if you can: selectors that no longer exist are the most common reason a beat goes missing.

HOW TO SUBMIT — pick whichever fits you (this replaces nothing until the owner approves it in their dashboard)
- If you have the Nookframe MCP server: call the "rerecord_nookframe_demo" tool with
  { "id": "${c.projectId}", "demoScript": <your script>, "note": "one line on what you changed and why" }
- If you have a shell: save the token once, then submit —
   ${loginCommand(tokenArg)}
   npx nookframe@latest rerecord ${c.projectId} --json '{"demoScript": <your script>, "note": "what you changed and why"}'
- Neither? Plain HTTP works too:
   curl -X POST ${submitUrl} \\
     -H "Authorization: Bearer ${tokenArg}" \\
     -H "Content-Type: application/json" \\
     -d '{"demoScript": <your script>, "note": "one line on what you changed and why"}'
Then tell the owner what you changed AND that nothing is re-recorded yet — they have to open Nookframe and press re-record.

Script shape:
\`\`\`json
${SHAPE_EN}
\`\`\``;
  }

  return `Nookframe 자동 시연 영상의 촬영 대본을 다시 써라. 이 작품은 네가 만들었고, 주인이 지금 영상을 보고 고칠 점을 말했다.

무엇이 마음에 안 드는지 (주인이 직접 쓴 말 — 이 일의 전부다):
"""
${c.note}
"""

작품 정보
${facts(c, "ko")}

지금 영상을 만든 대본 (이걸 고쳐라 — 멀쩡한 건 두고, 지적된 것만 바꿔라):
\`\`\`json
${current}
\`\`\`

규칙 (로봇은 대본을 글자 그대로 따른다)
- 이 대본이 곧 영상이다: 로봇은 딱 이 스텝들만, 이 순서로 찍고 끝낸다.
- 최소 3스텝, 5~8스텝이 적정, 최대 10. 순서=중요도이고 필름은 ~30초라 뒤부터 잘린다.
- 모든 스텝에 진짜 CSS "selector"를 줘라 — 전 스텝에 있으면(드래그는 toSelector, 입력은 text까지) 로봇이 화면을 읽는 비전 단계를 건너뛰고 DOM에서 직접 조립한다: 더 빠르고, 더 싸고, 프레이밍이 정확하다. "where"는 폴백일 뿐이다.
- "hold"(0.5~4초)는 그 스텝 결과를 오래 보여주고, "focus"는 조작 없이 그 영역을 확대한다.
- 로봇은 로그인·제출·삭제·파일선택을 절대 하지 않는다 — 시키지 마라.
- 가능하면 실제 페이지를 다시 확인해라. 사라진 셀렉터가 비트가 통째로 빠지는 가장 흔한 이유다.

제출 방법 — 셋 중 편한 걸로 (제출한다고 바로 바뀌지 않는다: 주인이 대시보드에서 확인하고 재촬영을 눌러야 반영된다)
- Nookframe MCP 서버가 있으면: "rerecord_nookframe_demo" 툴을 이렇게 호출해라 —
  { "id": "${c.projectId}", "demoScript": <네가 쓴 대본>, "note": "무엇을 왜 바꿨는지 한 줄" }
- 셸이 있으면: 토큰을 한 번 저장하고 제출해라 —
   ${loginCommand(tokenArg)}
   npx nookframe@latest rerecord ${c.projectId} --json '{"demoScript": <네가 쓴 대본>, "note": "무엇을 왜 바꿨는지"}'
- 둘 다 없으면 HTTP로 직접:
   curl -X POST ${submitUrl} \\
     -H "Authorization: Bearer ${tokenArg}" \\
     -H "Content-Type: application/json" \\
     -d '{"demoScript": <네가 쓴 대본>, "note": "무엇을 왜 바꿨는지 한 줄"}'
제출한 뒤에는 무엇을 바꿨는지, 그리고 **아직 재촬영이 시작된 게 아니라는 것**을 주인에게 말해라 — 주인이 Nookframe에서 확인하고 재촬영을 눌러야 시작된다.

대본 형식:
\`\`\`json
${SHAPE}
\`\`\``;
}
