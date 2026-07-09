import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client — bypasses RLS. SERVER-ONLY: the service key is a
// non-NEXT_PUBLIC env var, so it's undefined (and this throws) in any client
// bundle — never import this from a "use client" module. Use for trusted server
// writes/reads that RLS locks down: analytics_events, demo_events, the admin
// approval queue. Centralises the env plumbing the /admin page previously inlined.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
