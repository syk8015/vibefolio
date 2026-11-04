import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError } from "./apiError";

// Shared-secret gate for /api/worker/* — the recording worker's ONLY credential.
//
// Why this exists: the worker runs on the owner's personal Mac. Before this, that
// machine held SUPABASE_SERVICE_ROLE_KEY (RLS bypass over every table + the auth
// admin API), the R2 write keys, and RESEND_API_KEY (send mail as nookframe.com)
// in plaintext .env.local — so a lost or compromised laptop was a full prod
// compromise. Those three now live only on the server; the Mac holds this secret
// instead, which can do exactly what the routes below allow and nothing else.
// Revocation = rotate WORKER_SECRET in Vercel (the old value stops working on the
// next deploy's cold start).
//
// Same Bearer shape as CRON_SECRET (app/api/cron/health), but compared in constant
// time: unlike the cron secret this one is presented on every poll, so a timing
// oracle would get plenty of samples.
type WorkerGate = "ok" | "unconfigured" | "denied";

function authorizeBearer(req: NextRequest, secret: string | undefined): WorkerGate {
  if (!secret) return "unconfigured";
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return "denied";
  const presented = header.slice("Bearer ".length).trim();
  if (!presented) return "denied";
  // Hash both sides first: timingSafeEqual throws on a length mismatch, and that
  // throw would itself leak the secret's length. Digests are always 32 bytes.
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b) ? "ok" : "denied";
}

function gateResponse(gate: WorkerGate, envName: string, unconfiguredCode: string) {
  if (gate === "unconfigured") {
    // Loud 503 rather than a silent open door — a deploy that forgot the env var
    // must stop the caller, not run it unauthenticated.
    return apiError({
      status: 503,
      message: `${envName} not configured`,
      code: unconfiguredCode,
      log: true,
    });
  }
  if (gate === "denied") {
    return apiError({ status: 401, message: "unauthorized", code: "UNAUTHORIZED", log: false });
  }
  return null;
}

// Returns null when the caller is the worker, or the response to send back.
// Callers: `const denied = requireWorker(req); if (denied) return denied;`
export function requireWorker(req: NextRequest) {
  return gateResponse(authorizeBearer(req, process.env.WORKER_SECRET), "WORKER_SECRET", "WORKER_UNCONFIGURED");
}

// The nightly meme job on the owner's Mac (2026-11-04, daily memes). A SEPARATE
// secret from the worker's on purpose: it can only drop lines into the review queue
// as 'pending' (/api/worker/memes) — never read, approve, publish or delete — and the
// recording worker's secret can't reach that route either. Revocation = rotate
// MEME_SECRET in Vercel. A value equal to WORKER_SECRET is refused (503) so the two
// can't silently collapse into one key.
export function requireMemeJob(req: NextRequest) {
  const secret = process.env.MEME_SECRET;
  const same = !!secret && secret === process.env.WORKER_SECRET;
  return gateResponse(authorizeBearer(req, same ? undefined : secret), "MEME_SECRET", "MEME_UNCONFIGURED");
}
