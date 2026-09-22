// 클립보드 복사 단일 구현 — 컴포넌트마다 폴백 있음/없음/에러 무시가 제각각이던
// 것을 한 곳으로. 반환값으로 성공 여부를 알려 호출부가 "복사됨" 표시를 정직하게
// 띄울 수 있다. (공개 명함의 CopyLinkButton은 theater 불가침 원칙상 미전환.)
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * 네트워크에서 받아 올 글을 복사한다 — 사파리 대응(2026-09-22, 출시 점검 A2).
 *
 * 사파리는 클릭 **직후**(사용자 제스처 안)에서만 클립보드 쓰기를 허락한다. `fetch`를
 * 한 번 기다린 뒤 `copyText`를 부르면 제스처가 끝나 거절된다(크롬은 여유가 있어 통과).
 * 그래서 쓰기를 **먼저** 시작하고, 내용은 Promise로 넘긴다 — 사파리·크롬 모두
 * Promise를 받는 `ClipboardItem`을 제스처 안에서 허락한다.
 *
 * 반드시 클릭 핸들러에서 `await` 없이 바로 불러야 한다. 글 만들기가 실패하면(서버 오류)
 * 그 에러를 그대로 던진다 — 호출부가 "발급 실패"와 "복사 실패"를 가를 수 있게.
 * 복사만 실패하면 false: 호출부는 받은 글을 읽기 전용 칸으로 보여 줘야 한다(`ManualCopyBox`).
 */
export async function copyTextLater(text: Promise<string>): Promise<boolean> {
  let writing: Promise<void> | null = null;
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const blob = text.then((s) => new Blob([s], { type: "text/plain" }));
      writing = navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      // 글 만들기가 실패하면 쓰기도 같이 거절된다 — 그 에러는 아래 `await text`가 던진다.
      writing.catch(() => {});
    }
  } catch {
    writing = null;
  }
  const s = await text;
  if (writing) {
    try {
      await writing;
      return true;
    } catch {
      // Promise ClipboardItem을 모르는 옛 브라우저 — 아래 평범한 경로로 한 번 더.
    }
  }
  return copyText(s);
}
