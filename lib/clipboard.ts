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
