import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdmin } from "@/lib/routeAuth";
import MemeReview, { type MemeRow, type MemeRunInfo } from "./MemeReview";
import { kstDay } from "@/lib/memeReview";

// 오늘의 밈 검토(2026-11-05, 시안 C '교정쇄') — 밤 작업(scripts/memes/)이 '대기'로 넣은 후보를
// 하나씩 보고 공개·고쳐서 공개·버리기. 공개한 것만 홈에 뜬다. 끝낸 것은 14일치를 보여 주고 거기서 내리거나 되돌린다.
export const dynamic = "force-dynamic";

const DONE_DAYS = 14;

export default async function MemesPage() {
  const gate = await checkAdmin("/admin/memes");
  if (gate.kind === "denied") notFound();
  if (gate.kind === "step-up") redirect("/admin/verify?next=%2Fadmin%2Fmemes");

  const admin = createAdminClient();
  // eslint-disable-next-line react-hooks/purity -- 서버 컴포넌트(force-dynamic): 요청마다 한 번 그린다.
  const now = Date.now();
  const since = new Date(now - DONE_DAYS * 86400_000).toISOString();
  const cols =
    "id, lang, audience, kind, text, reply, replaces, source, trend, sensitivity, sensitivity_score, status, edited, reviewed_at, created_at";

  const [pendingRes, doneRes, runRes] = await Promise.all([
    admin.from("meme_lines").select(cols).eq("status", "pending").order("created_at", { ascending: true }).limit(200),
    admin.from("meme_lines").select(cols).neq("status", "pending").gte("reviewed_at", since).order("reviewed_at", { ascending: false }).limit(200),
    admin.from("meme_runs").select("run_date, status, reason, usage, counts, created_at").order("created_at", { ascending: false }).limit(1),
  ]);

  const loadError = pendingRes.error || doneRes.error || runRes.error;
  return (
    <MemeReview
      initial={[...((pendingRes.data ?? []) as MemeRow[]), ...((doneRes.data ?? []) as MemeRow[])]}
      run={(runRes.data?.[0] ?? null) as MemeRunInfo | null}
      loadError={loadError ? "후보를 불러오지 못했어요. 새로고침해 주세요." : null}
      today={kstDay(now)}
    />
  );
}
