import SendForm from "./SendForm";
import { createClient } from "@/lib/supabase/server";

// 폰 → 컴퓨터 넘기기 화면(docs/desktop-handoff.md). 로그인했으면 계정 이메일을 서버에서
// 채워 보낸다 — 브라우저가 나중에 물어 오면 이메일 칸 화면이 잠깐 보였다가 바뀐다
// (가입 화면에서 겪은 것과 같은 문제, 09-24).
export default async function SendPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <SendForm accountEmail={user?.email ?? null} />;
}
