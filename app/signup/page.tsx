import AuthDoor, { type AuthHandoff } from "@/components/auth/AuthDoor";
import { doorStart } from "@/components/auth/doorStart";
import { findLiveHandoff } from "@/lib/handoffStore";
import { logger } from "@/lib/logger";

// /signup = /login과 같은 문 하나(components/auth/AuthDoor, 2026-10-02). 다른 점은 폰 → 컴퓨터
// 넘기기(docs/desktop-handoff.md)뿐: 메일 링크 /signup?h=<id>로 오면 서버가 이메일을 찾아
// **처음 그려질 때부터** 채운 화면을 보내고, 곧장 메일 코드 길로 연다. 예전엔 브라우저가 화면을
// 그린 뒤 이메일을 물어 와서, 평소 화면이 한 번 보였다가 바뀌었다(09-24 사용자 확인).
// 여기서는 읽기만 한다 — "열림"(opened_at·handoff_opened)은 브라우저가 /api/handoff/open으로
// 찍는다. 메일 보안 검사기가 링크를 미리 열어도 열린 것으로 세지 않게.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const search = await searchParams;
  const { h } = search;
  let handoff: AuthHandoff | null = null;
  if (typeof h === "string" && h) {
    try {
      const row = await findLiveHandoff(h);
      if (row) handoff = { id: row.id, email: row.email, firstTouch: row.firstTouch };
    } catch (err) {
      // 못 읽으면 평소 문 — 들어오는 것 자체를 막을 이유는 없다.
      logger.error("signup: handoff lookup failed", { error: err });
    }
  }
  return <AuthDoor start={await doorStart(search, { handoff: handoff !== null })} handoff={handoff} />;
}
