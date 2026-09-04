import type { DemoScript } from "@/lib/demoScript";
import { loginCommand, outputLanguageLine } from "@/lib/connectSnippets";

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
      "goal": "what this beat proves (max 120 chars)",
      "selector": "the control's CSS selector — you know the code, give the exact one",
      "toSelector": "(action=drag) CSS selector of the drop target",
      "where": "how to find it by eye (visible label/position) — the fallback when a selector misses",
      "action": "click | type | drag | scroll | hover | draw | focus",
      "text": "(action=type) what to type",
      "expect": "what the screen should show right after",
      "hold": 2
    }
  ],
  "skip": ["things NOT worth a beat because every app has them — e.g. a dark-mode toggle"],
  "prep": "(optional) one setup line before the tour"
}`;

function facts(c: RerecordContext): string {
  const none = "(none)";
  const L = { id: "Project id (you need it to submit)", title: "Title", desc: "Description", url: "URL the robot opens", kind: "Category", tools: "Built with", access: "How to view without logging in (demoAccess)" };
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
  const tokenArg = token ?? "<a fresh token is filled in here when you press copy>";
  const current = c.currentScript
    ? JSON.stringify(c.currentScript, null, 2)
    : "(none — this film was shot without a script)";
  const submitUrl = `${origin.replace(/\/$/, "")}/api/ingest/rerecord/${c.projectId}`;

  // 본문은 영어 하나(2026-09-05). 대본의 goal/expect는 소유자가 검토 화면에서
  // 눈으로 읽는 문장이라, 그 언어만 outputLanguageLine이 정해 준다.
  return `Rewrite the filming script for a Nookframe auto-demo. You built this project; the owner watched the current film and told us what to fix.

${outputLanguageLine(locale)}

WHAT WENT WRONG (the owner's own words — this is the whole point of the job):
"""
${c.note}
"""

THE PROJECT
${facts(c)}

THE SCRIPT THAT PRODUCED THE CURRENT FILM (fix THIS — keep what works, change what the owner complained about):
\`\`\`json
${current}
\`\`\`

RULES (the robot follows the script literally)
- Your script IS the film: the robot shoots exactly these steps, in order, then stops.
- 4 steps minimum, 5–8 is the sweet spot, 10 max. Order = importance; the film is ~30s and gets cut from the END.
- Every step needs BOTH an "action" and a "selector" (or "where") — a step with only a goal is rejected, and at least 3 steps must clear this bar.
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
${SHAPE}
\`\`\``;
}
