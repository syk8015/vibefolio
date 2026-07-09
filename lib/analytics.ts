import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { AnalyticsEventName } from "@/lib/analytics-events";

// Server-side analytics writer (Next routes). Inserts into the RLS-locked
// analytics_events table via the service role. Fire-and-forget by contract:
// analytics must NEVER break a user flow, so every failure is swallowed and only
// logged (which now also reaches Sentry). Await it anyway on serverless so the
// insert lands before the function freezes.
//
// The recorder worker does NOT use this — it inserts through its own service-role
// client (see local-runner/worker.ts) to avoid pulling the Next `server-only`
// module into the tsx runtime.
export async function trackServerEvent(
  event: AnalyticsEventName,
  opts: {
    userId?: string | null;
    sessionId?: string | null;
    props?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("analytics_events").insert({
      event,
      user_id: opts.userId ?? null,
      session_id: opts.sessionId ?? null,
      props: opts.props ?? {},
    });
    if (error) logger.error("analytics: event insert failed", { error, event });
  } catch (err) {
    logger.error("analytics: event insert threw", { error: err, event });
  }
}
