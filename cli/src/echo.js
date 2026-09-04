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
    lines.push(ROW("데모 진입", accepted.demoAccess === "impossible"
      ? "불가 선언(랜딩만 촬영)"
      : accepted.demoAccess === "no-login"
        ? "로그인 불필요 선언"
        : accepted.demoAccess));
  }

  // 대본 점검표(2026-09-04) — 게이트는 통과했지만 어디가 약한지. 숫자로 한 줄,
  // 고칠 것은 아래 경고에 합류한다(같은 URL로 다시 publish하면 이 초안이 갱신됨).
  const review = accepted.scriptReview;
  if (review && typeof review === "object") {
    const parts = [
      `${review.steps}스텝`,
      `조작 ${review.interactive}`,
      `셀렉터 ${review.wired}/${review.steps}`,
      `기대값 ${review.withExpect}/${review.steps}`,
    ];
    const sel = review.selectors;
    if (sel?.status === "checked") parts.push(`라이브 HTML에서 셀렉터 ${sel.found}/${sel.checked} 확인`);
    lines.push(ROW("대본 점검", parts.join(" · ")));
  }

  // 경고는 조용한 폐기에만 붙인다 — 사용자가 준 값이 사라진 경우.
  const warn = [];
  for (const w of formatScriptReviewWarnings(review)) warn.push(w);
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
    warn.push("⚠ demoAccess가 저장되지 않았어요 — url·params·note / noLogin / impossible 형태인지 확인하세요.");
  }
  for (const w of warn) lines.push(`  ${w}`);
  return lines;
}

// 서버의 scriptReview(숫자·셀렉터 확인 결과) → 한국어 경고. 서버 hints(영어)를 그대로
// 찍지 않고 여기서 만드는 이유: 이 출력은 사람도 읽는 자리라 다른 줄과 같은 말투여야
// 한다. 판정 기준(6스텝·조작 2개)은 서버 lib/demoScriptReview.ts와 같다.
export function formatScriptReviewWarnings(review) {
  if (!review || typeof review !== "object") return [];
  const out = [];
  const total = review.steps ?? 0;
  if (total < 6) {
    out.push(`⚠ 대본이 ${total}스텝이에요 — 영상 30초를 채우려면 6~8스텝이 알맞아요. 핵심 기능을 중요한 순서대로 더 넣고 같은 URL로 다시 publish하면 이 초안이 갱신돼요.`);
  }
  if ((review.interactive ?? 0) < 2) {
    out.push(`⚠ 실제 조작(click·type·drag)이 ${review.interactive ?? 0}스텝뿐이에요 — 나머지가 focus·hover·scroll이면 슬라이드쇼처럼 보여요. 핵심 기능을 직접 눌러 결과가 바뀌는 스텝을 2개 이상 넣으세요.`);
  }
  if ((review.wired ?? 0) < total) {
    out.push(`⚠ selector 없는 스텝 ${total - review.wired}개 — 그 스텝은 로봇이 화면을 보고 추측해요(느리고 비쌈). 코드에서 정확한 CSS 셀렉터를 찾아 넣으세요.`);
  }
  if ((review.withExpect ?? 0) < total) {
    out.push(`⚠ expect 없는 스텝 ${total - review.withExpect}개 — "하고 나면 무엇이 보여야 하는지"가 없으면 로봇이 먹었는지 판정을 못 해요.`);
  }
  if (!review.hasSkip) {
    out.push("· skip 목록이 없어요 — 다크모드 토글처럼 찍으면 안 되는 것을 적어두면 영상이 새지 않아요.");
  }
  const sel = review.selectors;
  if (sel?.status === "checked" && sel.missing?.length) {
    out.push(`⚠ 라이브 페이지 HTML에서 못 찾은 셀렉터: ${sel.missing.join(", ")} — 오타이거나 다른 화면의 요소예요. 실제 화면에서 확인하거나 where로 눈에 보이는 찾는 법을 함께 적으세요.`);
  } else if (sel?.status === "skipped" && sel.reason === "js-rendered") {
    out.push("· 페이지가 자바스크립트로 그려져 셀렉터를 서버가 확인하지 못했어요 — 발행 전에 브라우저로 직접 열어 각 selector가 실제로 있는지 확인하세요.");
  } else if (sel?.status === "skipped" && (sel.reason === "fetch-failed" || sel.reason === "not-html")) {
    out.push(`· 셀렉터 확인용으로 페이지를 열지 못했어요(${sel.url}) — 주소가 실제로 열리는지, 로그인 없이 보이는지 확인하세요.`);
  }
  return out;
}
