// 발행/수정 결과 에코 포맷터(도그푸딩 C-1). 서버는 틀린 값을 에러 대신 조용히
// 버린다 — AI 툴 철자 불일치, contentType 오타, 500자 넘는 시연 핵심, 형태가
// 어긋난 demoAccess. 성공 메시지만 봐서는 무엇이 살아남았는지 알 수 없어서,
// 서버가 돌려준 accepted(= 실제 저장된 값)를 사람·AI 둘 다 읽을 수 있게 편다.
// 구버전 서버는 accepted를 안 주므로 그때는 빈 배열(출력 없음)로 조용히 물러난다.

// 한글은 터미널에서 두 칸을 차지한다 — 문자 수로 padEnd 하면 열이 어긋난다.
function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    const c = ch.codePointAt(0);
    const wide =
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f300;
    w += wide ? 2 : 1;
  }
  return w;
}

const LABEL_COLS = 12;
const ROW = (label, value) =>
  `    ${label}${" ".repeat(Math.max(1, LABEL_COLS - displayWidth(label)))}${value}`;

export function formatAccepted(accepted) {
  if (!accepted || typeof accepted !== "object") return [];
  const lines = ["  저장된 내용"];

  lines.push(ROW("제목", accepted.title || "(없음)"));

  const texts = [
    `설명 ${accepted.descriptionLines ?? 0}줄·${accepted.descriptionChars ?? 0}자`,
  ];
  if (accepted.builderNoteChars) texts.push(`말풍선 ${accepted.builderNoteChars}자`);
  if (accepted.demoHighlightsChars) texts.push(`시연 핵심 ${accepted.demoHighlightsChars}자`);
  if (accepted.demoScriptSteps) texts.push(`촬영 대본 ${accepted.demoScriptSteps}스텝`);
  lines.push(ROW("글", texts.join(" · ")));

  lines.push(ROW("AI 툴", accepted.tags?.length ? accepted.tags.join(", ") : "(없음)"));
  lines.push(ROW("분류", accepted.contentType || "(없음 — 뱃지 미표시)"));
  if (accepted.entryUrl) lines.push(ROW("촬영·임베드", accepted.entryUrl));
  if (accepted.scoutAltUrl) lines.push(ROW("촬영 후보", `${accepted.scoutAltUrl}  (촬영 직전 둘 중 하나를 고름)`));
  if (accepted.demoAccess) {
    lines.push(ROW("데모 진입", accepted.demoAccess === "impossible" ? "불가 선언(랜딩만 촬영)" : accepted.demoAccess));
  }

  // 경고는 조용한 폐기에만 붙인다 — 사용자가 준 값이 사라진 경우.
  const warn = [];
  if (accepted.droppedTags?.length) {
    warn.push(`⚠ 버려진 AI 툴: ${accepted.droppedTags.join(", ")} — 지원 목록의 철자와 달라 저장되지 않았어요.`);
  }
  if (accepted.demoScriptDropped) {
    warn.push("⚠ 버려진 촬영 대본: demoScript 형식이 어긋나 저장되지 않았어요 — { steps: [{ goal, where?, action?, text?, expect? }] } 형태여야 해요.");
  }
  if (accepted.droppedContentType) {
    warn.push(`⚠ 버려진 분류: ${accepted.droppedContentType} — web-app·saas·mobile·game·extension·ai-service·media·other 중 하나여야 해요.`);
  }
  // 설명은 3줄 카피 — 글자 수보다 "줄 수"와 "한 줄 길이"가 화면을 결정한다.
  // 서버 상한(200자)에 걸리기 전에 이 두 가지가 먼저 화면을 망친다.
  if ((accepted.descriptionLines ?? 0) > 3) {
    warn.push(`⚠ 설명이 ${accepted.descriptionLines}줄이에요 — 명함 화면은 3줄까지만 보여줘요(전문은 상세 페이지에서).`);
  }
  if ((accepted.descriptionMaxLineCols ?? 0) > 46) {
    warn.push("⚠ 설명의 한 줄이 너무 길어요 — 폰에서 줄이 접히면서 마지막 줄이 안 보일 수 있어요(한 줄 20자 안팎 권장).");
  }
  if (accepted.demoHighlightsTruncated) {
    warn.push("⚠ 시연 핵심이 500자에서 잘렸어요.");
  }
  if (accepted.demoAccessDropped) {
    warn.push("⚠ demoAccess가 저장되지 않았어요 — url·params·note 또는 impossible 형태인지 확인하세요.");
  }
  for (const w of warn) lines.push(`  ${w}`);
  return lines;
}
