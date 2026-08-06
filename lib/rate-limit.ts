import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Per-IP fixed-window rate limiting backed by the rl_touch() Postgres function
// (supabase/migration_rate_limit.sql). SERVER-ONLY (service role).
//
// Fail-open by contract: the endpoints this guards (/api/track, /api/analytics,
// /api/report) must never break a user flow because the limiter itself hiccuped,
// so any RPC error logs and allows. A missing migration therefore degrades to
// "no rate limit", not "everything blocked" — same silent-degrade posture as the
// worker heartbeat.

// Client IP for the rate bucket. MUST come from a header the client cannot forge:
// x-vercel-forwarded-for is set by Vercel's edge, not settable by the request.
// The FIRST hop of a raw x-forwarded-for is attacker-controlled (the client can
// prepend anything; the platform appends its real value after), so it's usable
// only as a last resort and only its LAST hop. Hashed with the service key as
// pepper so raw IPs never sit in a table; stable per deploy, all a bucket needs.
export function clientIpKey(req: NextRequest): string {
  const ip =
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown");
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${pepper}:${ip}`).digest("hex").slice(0, 32);
}

export async function rateLimit(opts: {
  /** Bucket namespace, e.g. "track" — becomes "track:<key>" */
  name: string;
  /** Caller identity, usually clientIpKey(req) */
  key: string;
  windowSeconds: number;
  max: number;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rl_touch", {
      p_bucket: `${opts.name}:${opts.key}`,
      p_window_seconds: opts.windowSeconds,
      p_max: opts.max,
    });
    if (error) {
      logger.error("rate-limit: rl_touch failed (allowing)", { error, name: opts.name });
      return true;
    }
    return data === true;
  } catch (err) {
    logger.error("rate-limit: rl_touch threw (allowing)", { error: err, name: opts.name });
    return true;
  }
}
