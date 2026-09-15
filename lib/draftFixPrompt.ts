// 초안 "AI에게 고쳐달라기" 프롬프트 (2026-09-04, 인터뷰 ⑥).
//
// 초안 검토 화면에서 사람이 고칠 수 있는 건 글자(제목·소개글·한마디)와 대본의
// 순서·삭제까지다. 그보다 큰 수정 — 톤을 바꾸거나, 새 기능 비트를 넣거나,
// 셀렉터를 손보는 일 — 은 코드를 아는 AI 몫이다(사람이 CSS 셀렉터를 만지는
// 제품은 만들지 않기로 했다, 08-25). 그래서 재촬영 루프·/publish 되돌려보내기와
// 같은 해법: **사람은 불만 한 줄, 고치는 건 AI.** 지금 초안 전체와 사람의 요청을
// 통째로 싣고, JSON의 draftId로 다시 올리면 그 초안이 갱신된다는 사실까지 넣는다 —
// 새 세션의 AI가 이 프롬프트 하나로 일을 끝낼 수 있어야 한다.
import { loginCommand, NPX_PUBLISH, outputLanguageLine } from "@/lib/connectSnippets";
import type { DemoScript } from "@/lib/demoScript";
import type { DemoAccess } from "@/lib/demoAccess";

export interface DraftFixContext {
  /** 초안 id — JSON의 draftId로 실어야 다시 올릴 때 이 초안이 갱신된다(URL로 못 찾는 폴더 업로드 초안 포함, 09-15). */
  projectId: string;
  title: string;
  description: string;
  builderNote: string;
  demoHighlights: string | null;
  tags: string[];
  contentType: string | null;
  /** 대상 화면 답("mobile"|"desktop"). 게이트 이전 초안은 null — 이번에 답을 채워야 다시 올라간다. */
  targetDevice: string | null;
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
    // 서버가 URL 대신 이 id로 갱신할 초안을 찾는다 — CLI·MCP·/publish 붙여넣기 어느 길로 와도 같다.
    draftId: c.projectId,
    title: c.title,
    description: c.description,
    ...(c.builderNote ? { builderNote: c.builderNote } : {}),
    ...(c.demoHighlights ? { demoHighlights: c.demoHighlights } : {}),
    ...(c.tags.length ? { tags: c.tags } : {}),
    ...(c.contentType ? { contentType: c.contentType } : {}),
    // 재발행(upsert)은 모든 필드를 덮어쓰고 이 값은 필수라, 빠지면 400이다 — 답이 없던
    // 초안도 null로 보여 줘서 AI가 채우게 한다.
    targetDevice: c.targetDevice ?? null,
    ...(c.deployUrl ? { deployUrl: c.deployUrl } : {}),
    demoScript: c.demoScript ?? { steps: [] },
    demoAccess: c.demoAccess ?? {},
  };
  const json = JSON.stringify(payload, null, 2);
  const login = loginCommand(c.token);

  // 프롬프트 본문은 영어 하나로 통일(2026-09-05) — 결과 카피 언어만 locale이 정한다.
  return `Revise a Nookframe draft you published earlier. You built this project, so read the repo again if you need to.

${outputLanguageLine(locale)}

The owner looked at the draft and wants these changes:

"""
${c.note}
"""

THE DRAFT AS IT IS NOW (change what the owner asked for, keep the rest):
\`\`\`json
${json}
\`\`\`
${c.targetDevice ? "" : `\n"targetDevice" is still unanswered (null above) — set it to "mobile" or "desktop": the screen this app was mainly designed for (not the same as contentType). The server rejects the draft without it.\n`}

HOW TO RESUBMIT — keep "draftId" in the JSON: publishing it again updates this draft in place (no duplicate):
- If you have a shell: save the token once, write the revised JSON to a file, then publish again —
   ${login}
   ${NPX_PUBLISH} --file <that file>${c.deployUrl ? "" : "  (this draft was a file upload — add --dir <the folder> again)"}
- If you have the Nookframe MCP server: call "publish_to_nookframe" with the revised fields, draftId included.
- No shell? Print the revised JSON only and I'll paste it into ${c.origin}/publish.
The server rejects thin work with an error that says exactly what to fix — read it and resubmit. Then tell the owner what you changed.`;
}
