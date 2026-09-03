// 초안 "AI에게 고쳐달라기" 프롬프트 (2026-09-04, 인터뷰 ⑥).
//
// 초안 검토 화면에서 사람이 고칠 수 있는 건 글자(제목·소개글·한마디)와 대본의
// 순서·삭제까지다. 그보다 큰 수정 — 톤을 바꾸거나, 새 기능 비트를 넣거나,
// 셀렉터를 손보는 일 — 은 코드를 아는 AI 몫이다(사람이 CSS 셀렉터를 만지는
// 제품은 만들지 않기로 했다, 08-25). 그래서 재촬영 루프·/publish 되돌려보내기와
// 같은 해법: **사람은 불만 한 줄, 고치는 건 AI.** 지금 초안 전체와 사람의 요청을
// 통째로 싣고, 같은 URL로 다시 올리면 초안이 갱신된다는 사실까지 넣는다 —
// 새 세션의 AI가 이 프롬프트 하나로 일을 끝낼 수 있어야 한다.
import { loginCommand, NPX_PUBLISH } from "@/lib/connectSnippets";
import type { DemoScript } from "@/lib/demoScript";
import type { DemoAccess } from "@/lib/demoAccess";

export interface DraftFixContext {
  title: string;
  description: string;
  builderNote: string;
  demoHighlights: string | null;
  tags: string[];
  contentType: string | null;
  /** 초안이 여는 주소. 파일 업로드(/api/preview/…)면 null — AI는 폴더를 다시 올려야 한다. */
  deployUrl: string | null;
  demoScript: DemoScript | null;
  demoAccess: DemoAccess | null;
  /** 사람이 쓴 수정 요청 원문 */
  note: string;
  /** 복사 순간 자동 발급된 연결 토큰 */
  token: string;
  origin: string;
}

export function buildDraftFixPrompt(c: DraftFixContext, locale: "ko" | "en" = "ko"): string {
  const payload: Record<string, unknown> = {
    title: c.title,
    description: c.description,
    ...(c.builderNote ? { builderNote: c.builderNote } : {}),
    ...(c.demoHighlights ? { demoHighlights: c.demoHighlights } : {}),
    ...(c.tags.length ? { tags: c.tags } : {}),
    ...(c.contentType ? { contentType: c.contentType } : {}),
    ...(c.deployUrl ? { deployUrl: c.deployUrl } : {}),
    demoScript: c.demoScript ?? { steps: [] },
    demoAccess: c.demoAccess ?? {},
  };
  const json = JSON.stringify(payload, null, 2);
  const login = loginCommand(c.token);

  if (locale === "en") {
    return `Revise a Nookframe draft you published earlier. You built this project, so read the repo again if you need to. The owner looked at the draft and wants these changes:

"""
${c.note}
"""

THE DRAFT AS IT IS NOW (change what the owner asked for, keep the rest):
\`\`\`json
${json}
\`\`\`

HOW TO RESUBMIT — re-publishing with the same URL updates this draft in place (no duplicate):
- If you have a shell: save the token once, then publish again —
   ${login}
   ${NPX_PUBLISH} --json '<the revised JSON>'${c.deployUrl ? "" : "  (this draft was a file upload — add --dir <the folder> again)"}
- If you have the Nookframe MCP server: call "publish_to_nookframe" with the revised fields.
- No shell? Print the revised JSON only and I'll paste it into ${c.origin}/publish.
The server rejects thin work with an error that says exactly what to fix — read it and resubmit. Then tell the owner what you changed.`;
  }

  return `네가 전에 Nookframe에 올린 초안을 고쳐라. 이 프로젝트는 네가 만들었으니 필요하면 레포를 다시 읽어라. 주인이 초안을 보고 이렇게 고쳐 달라고 했다:

"""
${c.note}
"""

지금 초안 (주인이 말한 것만 바꾸고, 나머지는 그대로 둬라):
\`\`\`json
${json}
\`\`\`

다시 올리는 법 — 같은 URL로 publish를 다시 실행하면 새 초안이 생기지 않고 이 초안이 갱신된다:
- 셸이 있으면: 토큰을 한 번 저장하고 다시 올려라 —
   ${login}
   ${NPX_PUBLISH} --json '<고친 JSON>'${c.deployUrl ? "" : "  (이 초안은 파일 업로드였다 — --dir <그 폴더>를 다시 붙여라)"}
- Nookframe MCP 서버가 있으면: "publish_to_nookframe" 툴을 고친 항목으로 호출해라.
- 셸이 없으면: 고친 JSON만 출력해라 — 내가 ${c.origin}/publish 에 붙여넣는다.
부실하면 서버가 "무엇을 어떻게 고쳐라"는 에러로 되돌려보낸다 — 그걸 읽고 다시 보내라. 끝나면 무엇을 바꿨는지 주인에게 말해라.`;
}
