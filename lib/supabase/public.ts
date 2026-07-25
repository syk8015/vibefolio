import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// Cookie-free anon client for reading PUBLIC data (profiles, projects).
//
// The SSR client in `server.ts` reads cookies to resolve the logged-in user,
// which makes it unusable inside `unstable_cache` (cookies/headers can't be
// accessed in a cache scope). Public portfolio data is identical for every
// visitor, so we read it through a plain anon client — no session, no cookies —
// which is safe to wrap in `unstable_cache`. RLS still applies (anon read).
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// `unstable_cache` 안에서 읽기 실패를 null/[]로 삼키면 그 빈 값이 캐시에 눌러앉는다
// (여기선 60초). 1초짜리 DB 딸꾹질이 공개 명함을 60초 동안 404 "없는 사람"으로,
// 랜딩을 "0명이 사용 중"으로 만든다 — 데이터는 멀쩡한데.
//
// 그래서 "행이 진짜 없음"과 "읽지 못함"을 가른다. 전자(.single()의 PGRST116)만
// 통과시켜 null로 캐시하고, 후자는 던진다. 던진 호출은 캐시 엔트리를 남기지 않으므로
// 다음 요청이 곧 재시도이고, 잘못된 빈 화면이 굳지 않는다.
export function throwIfReadFailed(error: PostgrestError | null, where: string): void {
  if (!error || error.code === "PGRST116") return;
  logger.error(`public cached read failed: ${where}`, { error, code: error.code });
  throw error;
}
