// Safety — the network back-stop + the policy decision (plan §4.4/§4.5/§5.4).
//
// Two layers live here. The FIRST line of defence is behaviour (explore.ts's
// read-only system prompt — it just shouldn't click submit/pay/delete). This file
// is the BACK-STOP and the policy gate:
//
//   1. decidePolicy()   — read-only vs full, from sourceType + a .env/schema scan.
//   2. installSafety()  — page.route('**/*') that lets reads through and turns
//      write-suspect requests into a plausible fake 200, so a stray mutating
//      request NEVER reaches the user's real server (live_url or remote DB).
//
// Why fulfill, never abort: an aborted POST makes the SPA's optimistic update
// crash on `resp.id` (plan §7 결함A). A fake `{ ok, id, data, success }` lets the
// UI continue as if it worked — the "결과" we reveal is client-side anyway.
//
// Why this catches remote-DB writes too: a write is almost always *triggered* by a
// browser→server request; intercepting that hop means the server's write handler
// never runs (plan §4.4 통합 집행모델). Classification is necessarily incomplete
// (GraphQL persisted queries, Next Server Actions, tRPC batches), so this is a
// back-stop, not a guarantee — behaviour is the guarantee.
import type { Page, Route } from "playwright-core";

export type SafetyPolicy = "read-only" | "full";
export type SourceType = "live_url" | "github" | "zip";

// ── Policy decision (.env / schema scan) ─────────────────────────────────────────

// Remote managed-DB signatures. If any appears in the repo's env/config, writes
// would hit the user's real cloud data → force read-only (plan §4.5).
const REMOTE_DB_PATTERNS: RegExp[] = [
  /supabase\.(co|in)/i,
  /\bfirebaseio\.com\b/i,
  /\bfirebase(app|database)\b/i,
  /\.neon\.tech\b/i,
  /\bmongodb(\+srv)?:\/\//i,
  /\.mongodb\.net\b/i,
  /\bplanetscale\b|pscale_/i,
  /\.upstash\.io\b/i,
  /\bturso\b|libsql:\/\/(?!localhost|127\.)/i,
  /\.rds\.amazonaws\.com\b/i,
  /postgres\.vercel|vercel-storage/i,
  /\.render\.com\b.*(postgres|db)/i,
  /\.railway\.app\b/i,
];

// Verified-local signatures. A DB URL we can prove is sandbox-local (sqlite file /
// localhost / loopback) is the ONLY thing that unlocks full interaction.
const LOCAL_DB_PATTERNS: RegExp[] = [
  /\bfile:\.?\/?[^\s"']*\.(db|sqlite3?)\b/i,
  /\b[^\s"':]*\.(db|sqlite3?)\b/i,
  /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
];

// Keys whose values commonly carry a DB/connection string — we only scan these
// lines so a stray "supabase" word in a comment doesn't trip the detector.
const DB_KEY_HINT =
  /(DATABASE|DB|POSTGRES|PG|MONGO|REDIS|SUPABASE|FIREBASE|TURSO|NEON|PLANETSCALE|PRISMA|CONNECTION|DATASOURCE)/i;

function relevantLines(files: Record<string, string>): string {
  const out: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const isEnv = /\.env(\.|$)/.test(name) || /\.(toml|yaml|yml|json|prisma|ts|js)$/.test(name);
    if (!isEnv) continue;
    for (const line of content.split(/\r?\n/)) {
      if (DB_KEY_HINT.test(line) || /:\/\//.test(line)) out.push(line);
    }
  }
  return out.join("\n");
}

// Decide the safety policy. live_url is always read-only (real production). For a
// built repo we scan env/schema: any remote-DB signature → read-only; ONLY when
// the sole DB evidence is verified-local do we allow full interaction. Default =
// deny (read-only) when the picture is ambiguous (plan §4.5 "기본 deny").
export function decidePolicy(
  sourceType: SourceType,
  repoFiles?: Record<string, string>,
): SafetyPolicy {
  if (sourceType === "live_url") return "read-only";
  if (!repoFiles || Object.keys(repoFiles).length === 0) return "read-only";
  const hay = relevantLines(repoFiles);
  if (REMOTE_DB_PATTERNS.some((re) => re.test(hay))) return "read-only";
  const local = LOCAL_DB_PATTERNS.some((re) => re.test(hay));
  return local ? "full" : "read-only";
}

// ── Network interception ──────────────────────────────────────────────────────

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function looksGraphQL(url: string, postData: string | null): boolean {
  if (/graphql|graphiql/i.test(url)) return true;
  return /"(operationName|query)"\s*:/.test(postData || "");
}

export type ReqClass = "read" | "write-rest" | "write-graphql";

// Pure classifier (unit-tested offline). A read passes; a write-* is mocked.
// GraphQL is always POST, so a `query` must be classed read (blocking it blanks
// the app — 결함A); only a `mutation` is a write.
export function classify(method: string, url: string, postData: string | null): ReqClass {
  if (READ_METHODS.has(method)) return "read";
  if (looksGraphQL(url, postData)) {
    return /\bmutation\b/.test(postData || "") ? "write-graphql" : "read";
  }
  return "write-rest";
}

// A fake-but-plausible success body. Includes the fields a typical optimistic UI
// reads back (`id`, `data`, `success`) so it doesn't crash on undefined (결함A).
function mockBody(): string {
  return JSON.stringify({
    ok: true,
    success: true,
    id: `mock_${Date.now()}`,
    data: {},
    errors: null,
  });
}

export type BlockedWrite = { method: string; url: string; kind: "rest" | "graphql" };

// Install the read-only network back-stop on a page (explore + recording both get
// it). `full` policy is a no-op (sandbox-local DB → writes are harmless and we
// WANT the real commit-flow demo). onBlocked is invoked for every mocked write so
// the caller can assert "0 mutating requests reached the server".
export async function installSafety(
  page: Page,
  policy: SafetyPolicy,
  onBlocked?: (w: BlockedWrite) => void,
): Promise<void> {
  if (policy === "full") return;
  await page.route("**/*", async (route: Route) => {
    const req = route.request();
    const verdict = classify(req.method(), req.url(), req.postData());
    if (verdict === "read") return route.continue(); // incl. document/asset/preflight + GraphQL query
    onBlocked?.({ method: req.method(), url: req.url(), kind: verdict === "write-graphql" ? "graphql" : "rest" });
    return route.fulfill({ status: 200, contentType: "application/json", body: mockBody() });
  });
}
