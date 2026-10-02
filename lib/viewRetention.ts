import type { SupabaseClient } from "@supabase/supabase-js";

// 방문 기록 보관 기한 — 자세한 줄(portfolio_views)은 180일만 둔다. 지운 수는 주인별로
// portfolio_view_totals에 더해 대시보드 '전체' 숫자가 줄지 않는다(supabase/migration_view_retention.sql).
// 점검 크론이 5분마다 부르니 틱당 2000줄이면 하루 57만 줄 — 몰린 방문도 며칠이면 따라잡는다.
export const VIEW_RETENTION_DAYS = 180;
export const VIEW_ARCHIVE_BATCH = 2000;

export function viewRetentionCutoff(now: number): string {
  return new Date(now - VIEW_RETENTION_DAYS * 24 * 3_600_000).toISOString();
}

// 지운 줄 수. 함수가 아직 없으면(SQL 전) 오류를 던진다 — 부르는 쪽이 로그만 남긴다.
export async function runViewRetention(admin: SupabaseClient, { now }: { now: number }): Promise<number> {
  const { data, error } = await admin.rpc("archive_old_portfolio_views", {
    p_before: viewRetentionCutoff(now),
    p_limit: VIEW_ARCHIVE_BATCH,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
