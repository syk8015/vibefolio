import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, alertRecipients } from "@/lib/email";
import { AnalyticsEvent } from "@/lib/analytics-events";

// 미끼 두 층(2026-11-02, 보안 로드맵 1단계 4번 강화 — AI가 하는 공격에 맞춰).
// middleware(Edge)에서도 돌아야 해서 node crypto·next/headers·사전(lib/i18n)을 쓰지 않는다.
//
// 겉 미끼(누구나 닿음 → 작은 멈춤): 공격 도구가 늘 먼저 여는 주소(/.env, /backup.sql …)와 크롤러에게
//   들어오지 말라고 적어 둔 /internal/ 아래에 가짜 비밀 파일을 낸다. 거기 적힌 토큰은 서버 비밀값에서
//   뽑아 저장하지 않고, 쓰이면 알아본다. 쓰면 그 IP만 하루 동안 /api 전부 막힘 + 메일 하루 한 통.
//   주소를 여는 것만으로는 막지 않는다(스캐너가 하루 종일 연다) — 횟수만 센다(analytics bait_hit).
// 숨긴 미끼(데이터 저장소·백업·맥 → 공격자 확실 → 큰 멈춤): lib/tripwire.ts의 미끼 토큰 + 여기의
//   미끼 행 id(DECOY_IDS). 요청 주소에 그 id가 들어오면 사이트를 읽기 전용으로 잠근다.
// 무엇을 어디에 심었는지는 레포에 적지 않는다(레포는 공개) — 설정값은 Vercel에만 있다.

const TOKEN_SCHEME = "nf_live_";
const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

// ── 겉 미끼 토큰 ────────────────────────────────────────────────────────────
export const BAIT_LABELS = ["env", "sql", "notes"] as const;
export type BaitLabel = (typeof BAIT_LABELS)[number];

let baitCache: Promise<Map<string, BaitLabel>> | null = null;

/** 비밀값에서 뽑은 겉 미끼 토큰. 진짜 토큰과 같은 모양(nf_live_ + 43자). 비밀값이 없으면 null. */
export async function baitTokenFrom(secret: string, label: BaitLabel): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return TOKEN_SCHEME + b64url(await crypto.subtle.sign("HMAC", key, enc.encode(`nookframe-bait-v1:${label}`)));
}
function baitSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}
async function baitMap(): Promise<Map<string, BaitLabel>> {
  baitCache ??= (async () => {
    const secret = baitSecret();
    const m = new Map<string, BaitLabel>();
    if (!secret) return m;
    for (const l of BAIT_LABELS) m.set(await baitTokenFrom(secret, l), l);
    return m;
  })();
  return baitCache;
}
export async function baitToken(label: BaitLabel): Promise<string | null> {
  for (const [tok, l] of await baitMap()) if (l === label) return tok;
  return null;
}
/** 이 토큰이 겉 미끼면 어느 것인지. */
export async function baitLabelOf(raw: string): Promise<BaitLabel | null> {
  return (await baitMap()).get(raw) ?? null;
}

// ── 겉 미끼 주소 ────────────────────────────────────────────────────────────
// 진짜 Next 앱에 없는 주소들이라 지금은 404다. 내용은 그럴듯하게, 토큰 말고는 진짜 값이 없다.
type BaitRoute = { label: BaitLabel | "git"; body: (tok: string) => string };
const envBody = (tok: string) =>
  `# production — DO NOT COMMIT\nNODE_ENV=production\nNEXT_PUBLIC_SITE_URL=https://nookframe.com\n` +
  `# ingest bot (nightly import) — rotate via dashboard\nNOOKFRAME_INGEST_TOKEN=${tok}\n` +
  `ADMIN_NOTIFY=ops@nookframe.com\nRESEND_FROM="Nookframe <notify@nookframe.com>"\n`;
const sqlBody = (tok: string) =>
  `-- pg_dump excerpt (ops backup, partial)\n-- table: service_tokens\n` +
  `COPY public.service_tokens (id, name, token, created_at) FROM stdin;\n` +
  `1\tnightly-import\t${tok}\t2026-09-14 03:12:08+00\n\\.\n`;
const notesBody = (tok: string) =>
  `Ops notes (internal — not linked anywhere)\n\n` +
  `- Staging ingest smoke test:\n  curl -H "Authorization: Bearer ${tok}" https://nookframe.com/api/ingest/status\n` +
  `- Admin console: /admin (Google login, allowlisted emails only)\n- Rotate the ingest token after each release.\n`;
export const BAIT_ROUTES: Record<string, BaitRoute> = {
  "/.env": { label: "env", body: envBody },
  "/.env.production": { label: "env", body: envBody },
  "/.env.local": { label: "env", body: envBody },
  "/backup.sql": { label: "sql", body: sqlBody },
  "/dump.sql": { label: "sql", body: sqlBody },
  "/db.sql": { label: "sql", body: sqlBody },
  "/internal/ops-notes": { label: "notes", body: notesBody },
  "/.git/config": {
    label: "git",
    body: () =>
      `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n` +
      `[remote "origin"]\n\turl = git@github.com:nookframe/web.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n` +
      `[branch "main"]\n\tremote = origin\n\tmerge = refs/heads/main\n`,
  },
};

/** 겉 미끼 주소면 내보낼 본문. 아니면 null. */
export async function baitResponseBody(pathname: string): Promise<{ label: string; body: string } | null> {
  const route = BAIT_ROUTES[pathname];
  if (!route) return null;
  if (route.label === "git") return { label: "git", body: route.body("") };
  const tok = await baitToken(route.label);
  return tok ? { label: route.label, body: route.body(tok) } : null;
}

/** 겉 미끼 주소를 연 횟수(관제탑 이벤트 원본에 bait_hit). 미끼마다 10분 30건 상한. 실패는 삼킨다. */
export async function baitHitTask(label: string, path: string, country: string | null, ua: string | null) {
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("rl_touch", { p_bucket: `bait-hit:${label}`, p_window_seconds: 600, p_max: 30 });
    if (data !== true) return;
    await admin.from("analytics_events").insert({
      event: AnalyticsEvent.BaitHit,
      props: { label, path, country, ua: (ua ?? "").slice(0, 120) },
    });
  } catch {
    // 기록 실패는 조용히
  }
}

// ── IP 막기(겉 미끼 토큰을 쓴 곳) ─────────────────────────────────────────────
export const IP_BLOCK_SECONDS = 86_400;

/** lib/rate-limit.ts clientIpKeyFromHeaders와 같은 값(Edge용 Web Crypto 판). */
export async function ipKeyEdge(h: Pick<Headers, "get">): Promise<string> {
  const ip =
    h.get("x-vercel-forwarded-for") ??
    h.get("x-real-ip") ??
    (h.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown");
  return (await sha256Hex(`${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ip}`)).slice(0, 32);
}

export async function blockIpKey(key: string): Promise<void> {
  const admin = createAdminClient();
  // 행을 새로 만들거나, 지난 막힘이 끝났으면 다시 시작한다(rl_touch의 창 규칙). 한도는 안 쓴다.
  await admin.rpc("rl_touch", { p_bucket: `ipblock:${key}`, p_window_seconds: IP_BLOCK_SECONDS, p_max: 1_000_000_000 });
}

const blockCache = new Map<string, { at: number; blocked: boolean }>();
const BLOCK_TTL_MS = 30_000;
/** 이 IP가 막혀 있나. 인스턴스마다 30초 기억. 읽기 실패면 안 막힌 것으로. */
export async function isIpKeyBlocked(key: string): Promise<boolean> {
  const now = Date.now();
  const hit = blockCache.get(key);
  if (hit && now - hit.at < BLOCK_TTL_MS) return hit.blocked;
  let blocked = false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("rate_limits")
      .select("window_start")
      .eq("bucket", `ipblock:${key}`)
      .gt("window_start", new Date(now - IP_BLOCK_SECONDS * 1000).toISOString())
      .maybeSingle();
    blocked = !!data;
  } catch {
    blocked = false;
  }
  if (blockCache.size > 5_000) blockCache.clear();
  blockCache.set(key, { at: now, blocked });
  return blocked;
}

// ── 숨긴 미끼 id ────────────────────────────────────────────────────────────
/** DECOY_IDS(쉼표) → 소문자 uuid 목록. 순수 함수. */
export function parseDecoyIds(env: string | undefined): string[] {
  return (env ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s));
}
let decoyIds: string[] | null = null;
/** 요청 주소(경로+쿼리)에 숨긴 미끼 id가 들어 있나. */
export function touchesDecoyId(pathAndQuery: string): boolean {
  decoyIds ??= parseDecoyIds(process.env.DECOY_IDS);
  if (decoyIds.length === 0) return false;
  let s = pathAndQuery.toLowerCase();
  try { s = decodeURIComponent(s); } catch { /* 깨진 인코딩은 그대로 */ }
  return decoyIds.some((id) => s.includes(id));
}

// ── 큰 멈춤(숨긴 미끼) — Edge·Node 공용 ──────────────────────────────────────
function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
export async function alertMail(title: string, lines: string[]): Promise<void> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://nookframe.com";
  await sendEmail({
    to: alertRecipients(),
    subject: `[Nookframe] ${title}`,
    html:
      `<div style="font-family:sans-serif;font-size:14px;line-height:1.7">` +
      `<p style="font-size:16px;font-weight:700">${esc(title)}</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` +
      `<p><a href="${site}/admin#stop">비상 정지 열기</a></p></div>`,
  });
}

export async function stampAlert(key: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.from("system_status").select("alerts_state").eq("id", "singleton").single();
  const state = (data?.alerts_state ?? {}) as Record<string, string>;
  await admin.from("system_status").update({ alerts_state: { ...state, [key]: new Date().toISOString() } }).eq("id", "singleton");
}

/** 숨긴 미끼가 건드려졌다 — 사이트를 읽기 전용으로 잠그고 알린다. 절대 throw 하지 않는다. */
export async function lockForDecoy(what: string, from: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("system_status")
      .update({ site_readonly_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", "singleton")
      .is("site_readonly_at", null);
    await stampAlert("decoy");
    const { data: first } = await admin.rpc("rl_touch", { p_bucket: "tripwire-mail:decoy", p_window_seconds: 600, p_max: 1 });
    if (first === true) {
      await alertMail("미끼가 건드려졌어요 — 사이트를 읽기 전용으로 잠갔어요", [
        `무엇: ${what}`,
        `어디서: ${from}`,
        "진짜 사용자는 절대 모르는 숨긴 미끼라, 누군가 데이터 저장소·백업·맥 중 하나를 들여다봤다는 뜻이에요.",
        "다음: 관제탑 › 비상 정지에서 [전부 끊기] → 서비스 키·워커 열쇠·데이터 저장소 비밀번호 바꾸기 → 원인 찾은 뒤 읽기 전용 풀기.",
      ]);
    }
  } catch {
    // 감지가 고장 나도 응답은 그대로
  }
}

export function describeRequest(h: Pick<Headers, "get">): string {
  return `나라 ${h.get("x-vercel-ip-country") ?? "?"} · ${(h.get("user-agent") ?? "?").slice(0, 80)}`;
}
