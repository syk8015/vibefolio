import type { SupabaseClient } from "@supabase/supabase-js";
import { safeFetch, readResponseCapped } from "@/lib/ssrf";
import { logger } from "@/lib/logger";

// 공개 작품 링크 순찰(2026-09-30) — supabase/migration_link_patrol.sql.
//
// 촬영·그림 검사는 찍는 순간만 본다. 그 뒤에 사이트가 딴 곳으로 넘기거나(주소는 그대로),
// 죽거나(도메인 만료 → 남이 살 수 있음), 구글 위험 목록에 오르면 [체험하기]는 계속 그곳을
// 가리켰다. 점검 크론이 틱마다 몇 개씩, 작품마다 하루 한 번 열어 본다:
//   moved  — 처음 열었을 때 도착한 사이트와 지금 도착하는 사이트가 다르다(HTTP·meta refresh)
//   dead   — 3일 연달아 안 열린다(DNS·연결 실패, 404·410·5xx). 봇을 막는 401·403·429는 살아 있는 것.
//   unsafe — 구글 Web Risk(WEB_RISK_API_KEY가 있을 때만)가 위험 목록에 있다고 답한다.
// 표시가 있으면 명함·작품 화면이 [체험하기]를 숨긴다. 주인이 주소를 고치면 다음 틱에 먼저 다시 본다.
//
// 못 잡는 것(정직하게): 자바스크립트로 넘기기, 우리 순찰에만 멀쩡한 화면 보여주기, 같은 주소에서
// 내용만 바꾸는데 아직 구글 목록에 없는 새 피싱. 이건 신고 → 관리자 비공개가 막는다.

export type LinkState = "moved" | "dead" | "unsafe";
export const LINK_RECHECK_MS = 24 * 3_600_000;
export const LINK_DEAD_AFTER_MS = 72 * 3_600_000;
export const LINK_PATROL_MAX = 5;
const FETCH_TIMEOUT_MS = 6_000;
const WEB_RISK_TIMEOUT_MS = 4_000;
const BODY_PEEK_BYTES = 64 * 1024;

// ── 순수 판정(네트워크 없음 — scripts/probe-link-patrol-unit.mts) ─────────────

/** 순찰 대상: 외부 http(s) 주소만. 우리 업로드(/api/preview)와 GitHub 저장소는 뺀다. */
export function patrollableUrl(url: string | null | undefined): boolean {
  if (!url || !/^https?:\/\//i.test(url.trim())) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host !== "github.com" && host !== "www.github.com";
  } catch {
    return false;
  }
}

export function siteHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** a가 b와 같은 사이트인가(같은 호스트이거나 b의 하위 도메인). */
export function sameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`);
}

/** 이 상태 코드면 "안 열린다"로 센다. 봇 차단(401·403·429 등)은 살아 있는 것으로 본다. */
export function isDeadStatus(status: number): boolean {
  return status === 404 || status === 410 || status >= 500;
}

/** HTML 앞부분의 <meta http-equiv="refresh" content="0; url=…"> 목적지(없으면 null). */
export function metaRefreshTarget(html: string, base: string): string | null {
  const tag = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/i)?.[0];
  if (!tag) return null;
  const content = tag.match(/content\s*=\s*(["'])(.*?)\1/i)?.[2] ?? tag.match(/content\s*=\s*([^\s>]+)/i)?.[1];
  const target = content?.match(/url\s*=\s*['"]?([^'"]+)/i)?.[1]?.trim();
  if (!target) return null;
  try {
    const u = new URL(target, base);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

export type LinkObservation =
  | { ok: true; finalUrl: string }
  | { ok: false; reason: string };

export type LinkPrev = {
  checkedUrl: string | null;
  baselineHost: string | null;
  failSince: string | null;
};

export type LinkDecision = {
  state: LinkState | null;
  detail: string | null;
  baselineHost: string | null;
  failSince: string | null;
};

export function decideLinkState(input: {
  demoUrl: string;
  prev: LinkPrev;
  obs: LinkObservation;
  threat: string | null;
  now: number;
}): LinkDecision {
  const { demoUrl, obs, threat, now } = input;
  // 주소가 바뀌었으면 옛 주소의 기록은 버린다.
  const prev = input.prev.checkedUrl === demoUrl ? input.prev : { checkedUrl: null, baselineHost: null, failSince: null };
  if (!obs.ok) {
    const failSince = prev.failSince ?? new Date(now).toISOString();
    const dead = now - Date.parse(failSince) >= LINK_DEAD_AFTER_MS;
    return {
      state: threat ? "unsafe" : dead ? "dead" : null,
      detail: threat ?? (dead ? obs.reason : null),
      baselineHost: prev.baselineHost,
      failSince,
    };
  }
  const finalHost = siteHost(obs.finalUrl);
  const baselineHost = prev.baselineHost ?? finalHost;
  const moved = !sameSite(finalHost, baselineHost) && !sameSite(finalHost, siteHost(demoUrl));
  return {
    state: threat ? "unsafe" : moved ? "moved" : null,
    detail: threat ?? (moved ? finalHost : null),
    baselineHost,
    failSince: null,
  };
}

type PatrolRow = {
  id: string;
  demo_url: string | null;
  link_state: LinkState | null;
  link_state_detail: string | null;
  link_checked_url: string | null;
  link_checked_at: string | null;
  link_baseline_host: string | null;
  link_fail_since: string | null;
};

/** 이번 틱에 볼 행: 주소가 바뀐(또는 처음 보는) 행이 먼저, 그다음 하루 넘은 행. */
export function pickDue(rows: PatrolRow[], now: number, max = LINK_PATROL_MAX): PatrolRow[] {
  const changed = rows.filter((r) => r.link_checked_url !== r.demo_url);
  const stale = rows
    .filter((r) => r.link_checked_url === r.demo_url && (!r.link_checked_at || now - Date.parse(r.link_checked_at) >= LINK_RECHECK_MS))
    .sort((a, b) => Date.parse(a.link_checked_at ?? "") - Date.parse(b.link_checked_at ?? ""));
  return [...changed, ...stale].slice(0, max);
}

// ── 네트워크 ─────────────────────────────────────────────────────────────────

async function observe(url: string): Promise<LinkObservation> {
  try {
    const res = await safeFetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }, 5);
    const finalUrl = res.url || url;
    if (isDeadStatus(res.status)) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    // 흔한 "껍데기 페이지 → meta refresh로 딴 곳" 한 단계만 따라간다(열지는 않는다).
    const type = res.headers.get("content-type") ?? "";
    if (res.status < 300 && type.includes("html")) {
      const html = new TextDecoder().decode(await readResponseCapped(res, BODY_PEEK_BYTES));
      const next = metaRefreshTarget(html, finalUrl);
      if (next) return { ok: true, finalUrl: next };
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { ok: true, finalUrl };
  } catch (err) {
    return { ok: false, reason: (err as Error).name === "TimeoutError" ? "timeout" : (err as Error).message.slice(0, 120) };
  }
}

/** 구글 Web Risk 조회. 키가 없거나 조회가 실패하면 null(모름 — 표시를 바꾸지 않는다). */
async function webRiskThreat(urls: string[]): Promise<string | null | undefined> {
  const key = process.env.WEB_RISK_API_KEY;
  if (!key) return undefined;
  for (const uri of [...new Set(urls)]) {
    const q = new URLSearchParams({ uri, key });
    for (const t of ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]) q.append("threatTypes", t);
    try {
      const res = await fetch(`https://webrisk.googleapis.com/v1/uris:search?${q}`, { signal: AbortSignal.timeout(WEB_RISK_TIMEOUT_MS) });
      if (!res.ok) {
        logger.warn("link patrol: web risk lookup failed", { status: res.status });
        return undefined;
      }
      const body = (await res.json().catch(() => ({}))) as { threat?: { threatTypes?: string[] } };
      const types = body.threat?.threatTypes;
      if (types?.length) return types.join(",");
    } catch (err) {
      logger.warn("link patrol: web risk lookup threw", { error: err });
      return undefined;
    }
  }
  return null;
}

export type LinkPatrolResult = {
  checked: number;
  /** 이번 틱에 새로 위험(unsafe)이 된 작품 — 관리자 경보용. */
  newlyUnsafe: { id: string; detail: string | null }[];
  webRisk: boolean;
};

export async function runLinkPatrol(
  admin: SupabaseClient,
  opts: { now: number; max?: number },
): Promise<LinkPatrolResult> {
  const { now } = opts;
  const { data, error } = await admin
    .from("projects")
    .select("id, demo_url, link_state, link_state_detail, link_checked_url, link_checked_at, link_baseline_host, link_fail_since")
    .eq("is_draft", false)
    .like("demo_url", "http%")
    .order("link_checked_at", { ascending: true, nullsFirst: true })
    .limit(500);
  if (error) throw error;
  const rows = ((data ?? []) as PatrolRow[]).filter((r) => patrollableUrl(r.demo_url));
  const due = pickDue(rows, now, opts.max ?? LINK_PATROL_MAX);

  const results = await Promise.all(due.map(async (row) => {
    const demoUrl = row.demo_url!.trim();
    const obs = await observe(demoUrl);
    const threat = await webRiskThreat(obs.ok ? [demoUrl, obs.finalUrl] : [demoUrl]);
    // 조회를 못 했으면(키 없음·실패) 위험 판정은 지난 값을 유지한다 — 위험을 조용히 풀지 않게.
    const keptThreat = threat === undefined && row.link_state === "unsafe" && row.link_checked_url === row.demo_url
      ? row.link_state_detail ?? "unsafe"
      : threat ?? null;
    const d = decideLinkState({
      demoUrl: row.demo_url!,
      prev: { checkedUrl: row.link_checked_url, baselineHost: row.link_baseline_host, failSince: row.link_fail_since },
      obs,
      threat: keptThreat,
      now,
    });
    const { error: upErr } = await admin.from("projects").update({
      link_state: d.state,
      link_state_detail: d.detail,
      link_checked_url: row.demo_url,
      link_checked_at: new Date(now).toISOString(),
      link_baseline_host: d.baselineHost,
      link_fail_since: d.failSince,
    }).eq("id", row.id).eq("demo_url", row.demo_url!);
    if (upErr) logger.warn("link patrol: update failed", { error: upErr, projectId: row.id });
    return { row, d, threat };
  }));

  return {
    checked: results.length,
    newlyUnsafe: results
      .filter(({ row, d }) => d.state === "unsafe" && row.link_state !== "unsafe")
      .map(({ row, d }) => ({ id: row.id, detail: d.detail })),
    webRisk: !!process.env.WEB_RISK_API_KEY,
  };
}
