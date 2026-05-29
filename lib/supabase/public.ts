import { createClient } from "@supabase/supabase-js";

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
