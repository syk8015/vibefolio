// 발행/수정 결과 에코 포맷터(도그푸딩 C-1). 서버는 틀린 값을 에러 대신 조용히
// 버린다 — AI 툴 철자 불일치, contentType 오타, 500자 넘는 시연 핵심, 형태가
// 어긋난 demoAccess. 성공 메시지만 봐서는 무엇이 살아남았는지 알 수 없어서,
// 서버가 돌려준 accepted(= 실제 저장된 값)를 사람·AI 둘 다 읽을 수 있게 편다.
// 구버전 서버는 accepted를 안 주므로 그때는 빈 배열(출력 없음)로 조용히 물러난다.

// 라벨은 영어(ASCII)지만 값에는 한글 제목이 섞인다 — 한글은 터미널에서 두 칸을
// 차지하므로 문자 수로 padEnd 하면 열이 어긋난다.
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

const LABEL_COLS = 14;
const ROW = (label, value) =>
  `    ${label}${" ".repeat(Math.max(1, LABEL_COLS - displayWidth(label)))}${value}`;

export function formatAccepted(accepted) {
  if (!accepted || typeof accepted !== "object") return [];
  const lines = ["  Saved"];

  lines.push(ROW("title", accepted.title || "(none)"));

  const texts = [
    `description ${accepted.descriptionLines ?? 0} lines / ${accepted.descriptionChars ?? 0} chars`,
  ];
  if (accepted.builderNoteChars) texts.push(`note ${accepted.builderNoteChars} chars`);
  if (accepted.demoHighlightsChars) texts.push(`highlights ${accepted.demoHighlightsChars} chars`);
  if (accepted.demoScriptSteps) texts.push(`demo script ${accepted.demoScriptSteps} steps`);
  lines.push(ROW("text", texts.join(" · ")));

  lines.push(ROW("AI tools", accepted.tags?.length ? accepted.tags.join(", ") : "(none)"));
  lines.push(ROW("type", accepted.contentType || "(none — no badge shown)"));
  if (accepted.entryUrl) lines.push(ROW("film/embed", accepted.entryUrl));
  if (accepted.scoutAltUrl) lines.push(ROW("alt target", `${accepted.scoutAltUrl}  (one of the two is picked right before filming)`));
  if (accepted.demoAccess) {
    lines.push(ROW("demo access", accepted.demoAccess === "impossible"
      ? "declared impossible (landing page only)"
      : accepted.demoAccess === "no-login"
        ? "declared no login required"
        : accepted.demoAccess));
  }

  // 대본 점검표(2026-09-04) — 게이트는 통과했지만 어디가 약한지. 숫자로 한 줄,
  // 고칠 것은 아래 경고에 합류한다(같은 URL로 다시 publish하면 이 초안이 갱신됨).
  const review = accepted.scriptReview;
  if (review && typeof review === "object") {
    const parts = [
      `${review.steps} steps`,
      `interactive ${review.interactive}`,
      `selector ${review.wired}/${review.steps}`,
      `expect ${review.withExpect}/${review.steps}`,
    ];
    const sel = review.selectors;
    if (sel?.status === "checked") parts.push(`${sel.found}/${sel.checked} selectors found in live HTML`);
    lines.push(ROW("script check", parts.join(" · ")));
  }

  // 경고는 조용한 폐기에만 붙인다 — 사용자가 준 값이 사라진 경우.
  const warn = [];
  for (const w of formatScriptReviewWarnings(review)) warn.push(w);
  if (accepted.droppedTags?.length) {
    warn.push(`⚠ Dropped AI tools: ${accepted.droppedTags.join(", ")} — the spelling does not match the supported list, so they were not saved.`);
  }
  if (accepted.demoScriptDropped) {
    warn.push("⚠ Dropped demo script: the demoScript shape was invalid and was not saved — it must be { steps: [{ goal, where?, action?, text?, expect? }] }.");
  }
  if (accepted.droppedContentType) {
    warn.push(`⚠ Dropped type: ${accepted.droppedContentType} — must be one of web-app, saas, mobile, game, extension, ai-service, media, other.`);
  }
  // 설명은 3줄 카피 — 글자 수보다 "줄 수"와 "한 줄 길이"가 화면을 결정한다.
  // 서버 상한(200자)에 걸리기 전에 이 두 가지가 먼저 화면을 망친다.
  if ((accepted.descriptionLines ?? 0) > 3) {
    warn.push(`⚠ The description is ${accepted.descriptionLines} lines — the card shows at most 3 (the full text lives on the detail page).`);
  }
  if ((accepted.descriptionMaxLineCols ?? 0) > 46) {
    warn.push("⚠ One description line is too long — it wraps on phones and the last line gets cut off (aim for ~40 columns per line).");
  }
  if (accepted.demoHighlightsTruncated) {
    warn.push("⚠ demoHighlights was truncated at 500 characters.");
  }
  if (accepted.demoAccessDropped) {
    warn.push("⚠ demoAccess was not saved — check that it is { url, params, note } or { noLogin: true, note } or { impossible: true, note }.");
  }
  for (const w of warn) lines.push(`  ${w}`);
  return lines;
}

// 서버의 scriptReview(숫자·셀렉터 확인 결과) → 경고 문구. 서버 hints를 그대로 찍지
// 않고 여기서 만드는 이유: 이 출력은 사람도 읽는 자리라 다른 줄과 같은 말투여야
// 한다. 판정 기준(6스텝·조작 2개)은 서버 lib/demoScriptReview.ts와 같다.
export function formatScriptReviewWarnings(review) {
  if (!review || typeof review !== "object") return [];
  const out = [];
  const total = review.steps ?? 0;
  if (total < 6) {
    out.push(`⚠ The script has ${total} steps — 6 to 8 is right for a 30-second film. Add the key features in order of importance and publish again with the same URL to update this draft.`);
  }
  if ((review.interactive ?? 0) < 2) {
    out.push(`⚠ Only ${review.interactive ?? 0} step(s) actually operate the app (click/type/drag) — if the rest are focus/hover/scroll the film looks like a slideshow. Add at least 2 steps that press something and change the screen.`);
  }
  if ((review.wired ?? 0) < total) {
    out.push(`⚠ ${total - review.wired} step(s) have no selector — the robot has to look at the screen and guess for those (slow and expensive). Find the exact CSS selector in the code.`);
  }
  if ((review.withExpect ?? 0) < total) {
    out.push(`⚠ ${total - review.withExpect} step(s) have no expect — without "what should appear afterwards" the robot cannot tell whether the step landed.`);
  }
  if (!review.hasSkip) {
    out.push("· No skip list — listing things that must not be filmed (a dark-mode toggle, say) keeps the film on topic.");
  }
  const sel = review.selectors;
  if (sel?.status === "checked" && sel.missing?.length) {
    out.push(`⚠ Selectors not found in the live page HTML: ${sel.missing.join(", ")} — either a typo or an element from a different screen. Check them on the real page, or add a "where" describing how to spot it by eye.`);
  } else if (sel?.status === "skipped" && sel.reason === "js-rendered") {
    out.push("· The page is rendered by JavaScript, so the server could not verify the selectors — open it in a browser before publishing and confirm each selector really exists.");
  } else if (sel?.status === "skipped" && (sel.reason === "fetch-failed" || sel.reason === "not-html")) {
    out.push(`· Could not fetch the page to verify selectors (${sel.url}) — check that the URL actually opens and is visible without logging in.`);
  }
  return out;
}
