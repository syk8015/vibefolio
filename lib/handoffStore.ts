import { createAdminClient } from "@/lib/supabase/admin";
import { HANDOFF_TTL_MS, isHandoffId, sanitizeTouch, type HandoffTouch } from "@/lib/handoff";

// 폰 → 컴퓨터 넘기기 행 읽기(docs/desktop-handoff.md). SERVER-ONLY — 관리자 권한 열쇠.
// 가입 화면(app/signup/page.tsx, 서버에서 이메일을 채워 보냄)과 /api/handoff/open이
// 같은 규칙으로 읽는다: uuid 모양 + 30일 안 된 행만.
export interface LiveHandoff {
  id: string;
  email: string;
  firstTouch: HandoffTouch | null;
  openedAt: string | null;
}

export async function findLiveHandoff(id: unknown): Promise<LiveHandoff | null> {
  if (!isHandoffId(id)) return null;
  const since = new Date(Date.now() - HANDOFF_TTL_MS).toISOString();
  const { data, error } = await createAdminClient()
    .from("desktop_handoffs")
    .select("id, email, first_touch, opened_at")
    .eq("id", id)
    .gte("created_at", since)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    firstTouch: sanitizeTouch(data.first_touch),
    openedAt: data.opened_at,
  };
}
