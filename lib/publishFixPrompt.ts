import { outputLanguageLine } from "@/lib/connectSnippets";

// /publish 되돌려보내기 루프 (2026-08-28).
//
// 왜 필요한가: 인제스트는 저장 전에 여러 게이트로 되돌려보낸다(대본 3스텝·로그인
// 답변·설명 길이·네이티브 앱…). PAT 경로에선 그 거절이 **AI의 도구 출력**으로
// 들어가서 AI가 알아서 고쳐 다시 보낸다 — 거절이 곧 품질을 끌어올리는 순간이다.
//
// 그런데 /publish(셸 없는 챗봇 경로)에선 같은 거절이 **사람 눈앞의 빨간 글씨**로
// 끝난다. JSON을 쓴 건 AI인데, 고치라는 말은 사람이 받는다. 사람은 그 문단을
// 직접 손으로 옮겨 적어 AI에게 되물어야 했다 — 여기서 대부분 포기한다.
//
// 그래서 재촬영 루프와 같은 해법을 쓴다: **사람은 버튼 하나, 고치는 건 AI.**
// 거절 사유와 방금 보낸 JSON을 통째로 담은 프롬프트를 만들어 클립보드에 준다.
// 게이트 카피 자체가 이미 "무엇을 어떻게 채워야 하는지"를 다 담고 있으므로
// (t.api.scriptRequired · t.api.demoAccessRequired 등) 여기서 규격을 또 싣지 않는다.

/** 프롬프트에 싣는 원본 JSON 상한 — 클립보드가 감당 못 할 만큼 크면 잘라낸다. */
export const PUBLISH_FIX_JSON_MAX = 20_000;

export function buildPublishFixPrompt(
  reason: string,
  submittedJson: string,
  locale: "ko" | "en" = "ko",
): string {
  const json =
    submittedJson.length > PUBLISH_FIX_JSON_MAX
      ? `${submittedJson.slice(0, PUBLISH_FIX_JSON_MAX)}\n… (truncated — too long)`
      : submittedJson;

  // 본문은 영어 하나(2026-09-05). 거절 사유(reason)는 화면 언어 그대로 실린다 —
  // AI가 그걸 읽고 고치는 데는 문제가 없고, 사람이 같은 문장을 화면에서 봤다.
  return `The JSON below was rejected when I tried to publish it to Nookframe. Read the reason, fix the JSON, and give me the corrected version.

Reply with the complete JSON object only — no explanation, no code fence, nothing else. Keep everything that was already fine; change only what the reason asks for.

${outputLanguageLine(locale)}

--- why it was rejected ---
${reason}

--- the JSON I sent ---
${json}`;
}
