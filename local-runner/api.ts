// The worker's ONLY link to production data.
//
// Before this module the recorder talked straight to Supabase with the
// service-role key and to R2 with the bucket's write keys, all sitting in
// plaintext on the owner's personal Mac — so a lost laptop was a full prod
// compromise (전 유저 이메일 조회·계정 삭제 포함). Now the Mac carries one
// credential, WORKER_SECRET, and every read/write goes through /api/worker/*,
// which decides what is allowed. Revocation = rotate the value in Vercel.
//
// ⚠️ Do NOT reintroduce a Supabase or R2 client here. The whole point is that this
// machine cannot address the database or the bucket on its own.
import "./config"; // side-effect: load .env.local

const ORIGIN = (
  process.env.WORKER_API_ORIGIN ||
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  "https://nookframe.com"
).replace(/\/+$/, "");

export class WorkerApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function secret(): string {
  const s = process.env.WORKER_SECRET;
  if (!s) {
    throw new Error(
      "WORKER_SECRET not set (.env.local) — the worker cannot reach /api/worker/*. " +
        "Set the same value here and in Vercel.",
    );
  }
  return s;
}

// Network blips used to be impossible (the DB client retried internally); now a
// dropped Wi-Fi packet or a cold serverless start can surface as a failed call.
// Retry transport errors and 5xx a few times with backoff; never retry a 4xx —
// that is us sending something wrong, and repeating it just wastes time.
const RETRY_DELAYS_MS = [500, 1500, 4000];

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${ORIGIN}${path}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${secret()}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      lastErr = err;
      continue; // transport failure — retry
    }
    if (res.ok) return (await res.json()) as T;
    const text = await res.text().catch(() => "");
    const err = new WorkerApiError(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`, res.status);
    if (res.status < 500) throw err; // our fault; retrying changes nothing
    lastErr = err;
  }
  throw lastErr instanceof Error
    ? lastErr
    : new WorkerApiError(`${method} ${path} failed after retries`, 0);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body ?? {});
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

// Best-effort variant for calls that must never fail a job (analytics, phase
// pings, heartbeats). Mirrors the old "log the DB error and carry on" behaviour.
export async function apiPostQuiet<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    return await apiPost<T>(path, body);
  } catch (err) {
    console.error(`[api] ${path} failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── signed storage transfers ────────────────────────────────────────────────
export type SignedTarget = {
  key: string;
  url: string;
  headers: Record<string, string>;
  publicUrl: string;
};

// Stream bytes to a pre-signed bucket URL. The headers came from the signer and
// MUST be echoed verbatim — R2 rejects a PUT whose headers differ from the
// signature with 403 SignatureDoesNotMatch.
export async function putSigned(target: SignedTarget, body: Buffer): Promise<void> {
  const res = await fetch(target.url, {
    method: "PUT",
    headers: target.headers,
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`signed upload failed for ${target.key}: ${res.status} ${text.slice(0, 200)}`);
  }
}

export async function fetchSigned(url: string, what: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`signed download failed at ${what}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
