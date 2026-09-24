import type { SupabaseClient } from "@supabase/supabase-js";
import { detectVideoKind } from "@/lib/video";

// 사이트 순찰 — "조용히 깨지는 3곳"(docs/promo-publish.md §4.3)을 점검 크론이 5분마다 두드린다.
// 셋 다 깨져도 화면엔 에러가 안 뜨고, 사람이 직접 눌러 보기 전엔 모른다:
//   1. OAuth 발견 문서 — 두 항목이 빠지면 Claude 연결이 조용히 실패한다(AGENTS.md).
//      클로드가 실제로 읽는 `/.well-known/…`(rewrite) 주소로 두드려야 rewrite 고장도 잡힌다.
//   2. 무인증 `POST /api/mcp` — 401 + WWW-Authenticate의 resource_metadata가 로그인 화면의 출발점.
//   3. 영상 붙은 공개 작품의 주인 명함(`/@핸들` → `/핸들` 307)에 <video>가 그려지는지.
//      대상이 없으면 건너뛴다(09-24 기준 0개 — 안 그러면 매 틱 헛경보).
//
// 점검 크론이 느려지면 cron-job.org가 작업을 꺼버릴 수 있어 요청마다 짧게 끊고 셋을 동시에 돈다.
// 네트워크 오류만 한 번 더 시도한다(한 틱의 순간 끊김으로 메일이 가지 않게).

export const PATROL_TIMEOUT_MS = 5_000;

export type PatrolResult = {
  oauthMeta: "ok" | "fail";
  mcpChallenge: "ok" | "fail";
  ownerVideo: "ok" | "fail" | "skipped";
  /** 3번에서 두드린 명함 주소(대상이 없으면 null). */
  ownerVideoPage: string | null;
  /** 실패 이유 — 경보 메일·로그용. */
  notes: string[];
};

// ── 순수 판정(네트워크 없음 — scripts/probe-site-patrol-unit.mts) ─────────────

/** 발견 문서에 CIMD 두 항목이 **같이** 있는가. */
export function authServerMetaOk(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as Record<string, unknown>;
  const methods = d.token_endpoint_auth_methods_supported;
  return (
    d.client_id_metadata_document_supported === true &&
    Array.isArray(methods) &&
    methods.includes("none")
  );
}

/** 무인증 MCP 호출이 401 + resource_metadata 안내를 돌려주는가. */
export function mcpChallengeOk(status: number, wwwAuthenticate: string | null): boolean {
  return status === 401 && !!wwwAuthenticate && /resource_metadata="[^"]+"/.test(wwwAuthenticate);
}

/** 서버가 그린 HTML에 <video> 요소가 있는가. */
export function htmlHasVideo(html: string): boolean {
  return /<video[\s>]/i.test(html);
}

export type PatrolProjectRow = {
  user_id: string;
  video_url: string | null;
  demo_video_url: string | null;
  is_featured: boolean | null;
  sort_order: number | null;
  created_at: string;
};

/**
 * 명함 무대(TheaterStage LivePreview)가 이 작품을 <video>로 그리는가.
 * 수동 영상이 youtube·vimeo면 iframe이라 아니다(수동 영상이 자동 영상보다 앞선다).
 */
export function stageRendersVideo(p: Pick<PatrolProjectRow, "video_url" | "demo_video_url">): boolean {
  const kind = p.video_url ? detectVideoKind(p.video_url) : "unknown";
  if (p.video_url && kind !== "unknown") return kind === "direct";
  return !!p.demo_video_url;
}

/**
 * 한 사람의 공개 작품 중 명함이 처음 무대에 올리는 작품 — app/[username]/page.tsx와 같은 규칙
 * (sort_order 오름차순 → created_at 내림차순, 대표작 표시가 있으면 그것, 없으면 첫 번째).
 */
export function initialStageProject<T extends PatrolProjectRow>(rows: T[]): T | null {
  const sorted = [...rows].sort((a, b) => {
    // Postgres 오름차순은 null을 맨 뒤에 둔다.
    const sa = a.sort_order ?? Infinity;
    const sb = b.sort_order ?? Infinity;
    if (sa !== sb) return sa < sb ? -1 : 1;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
  return sorted.find((r) => r.is_featured) ?? sorted[0] ?? null;
}

/** 무대 첫 작품이 <video>로 그려지는 주인 한 명(없으면 null). */
export function pickVideoStageOwner(rows: PatrolProjectRow[]): string | null {
  const byUser = new Map<string, PatrolProjectRow[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  for (const [userId, list] of byUser) {
    const stage = initialStageProject(list);
    if (stage && stageRendersVideo(stage)) return userId;
  }
  return null;
}

// ── 실제 순찰 ────────────────────────────────────────────────────────────────

async function fetchOnceMore(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const attempt = () => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  try {
    return await attempt();
  } catch {
    return attempt();
  }
}

export async function runSitePatrol(
  admin: SupabaseClient,
  opts: { origin: string; timeoutMs?: number },
): Promise<PatrolResult> {
  const { origin } = opts;
  const timeoutMs = opts.timeoutMs ?? PATROL_TIMEOUT_MS;
  const notes: string[] = [];

  const oauthMeta = (async (): Promise<PatrolResult["oauthMeta"]> => {
    try {
      const res = await fetchOnceMore(`${origin}/.well-known/oauth-authorization-server`, {}, timeoutMs);
      const doc = res.ok ? await res.json().catch(() => null) : null;
      if (authServerMetaOk(doc)) return "ok";
      notes.push(`oauth-meta: HTTP ${res.status}${res.ok ? " · CIMD 두 항목 중 빠진 것 있음" : ""}`);
    } catch (err) {
      notes.push(`oauth-meta: ${(err as Error).name}`);
    }
    return "fail";
  })();

  const mcpChallenge = (async (): Promise<PatrolResult["mcpChallenge"]> => {
    try {
      const res = await fetchOnceMore(
        `${origin}/api/mcp`,
        {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        },
        timeoutMs,
      );
      const header = res.headers.get("www-authenticate");
      if (mcpChallengeOk(res.status, header)) return "ok";
      notes.push(`mcp-401: HTTP ${res.status} · WWW-Authenticate ${header ? "resource_metadata 없음" : "없음"}`);
    } catch (err) {
      notes.push(`mcp-401: ${(err as Error).name}`);
    }
    return "fail";
  })();

  const ownerVideo = (async (): Promise<{ status: PatrolResult["ownerVideo"]; page: string | null }> => {
    // 영상 있는 공개 작품의 주인들 → 그 주인들의 공개 작품 전부(무대 첫 작품을 가리려면 전부 필요).
    const { data: withVideo, error } = await admin
      .from("projects")
      .select("user_id")
      .eq("is_draft", false)
      .or("video_url.not.is.null,demo_video_url.not.is.null")
      .limit(50);
    if (error) {
      notes.push(`owner-video: 작품 조회 실패 — ${error.message}`);
      return { status: "skipped", page: null };
    }
    const owners = [...new Set((withVideo ?? []).map((r) => r.user_id as string))].slice(0, 10);
    if (owners.length === 0) return { status: "skipped", page: null };

    const { data: rows, error: rowsErr } = await admin
      .from("projects")
      .select("user_id, video_url, demo_video_url, is_featured, sort_order, created_at")
      .eq("is_draft", false)
      .in("user_id", owners);
    if (rowsErr) {
      notes.push(`owner-video: 작품 조회 실패 — ${rowsErr.message}`);
      return { status: "skipped", page: null };
    }
    const userId = pickVideoStageOwner((rows ?? []) as PatrolProjectRow[]);
    if (!userId) return { status: "skipped", page: null };

    const { data: prof } = await admin.from("profiles").select("username").eq("id", userId).single();
    const username = (prof?.username as string | null) ?? null;
    if (!username) return { status: "skipped", page: null };

    // /@핸들 → /핸들 307을 따라간 뒤의 페이지를 본다(링크로 퍼지는 주소가 /@핸들이다).
    const page = `${origin}/@${encodeURIComponent(username)}`;
    try {
      const res = await fetchOnceMore(page, { redirect: "follow" }, timeoutMs);
      const html = res.ok ? await res.text() : "";
      if (res.ok && htmlHasVideo(html)) return { status: "ok", page };
      notes.push(`owner-video: ${page} HTTP ${res.status}${res.ok ? " · <video> 없음" : ""}`);
    } catch (err) {
      notes.push(`owner-video: ${page} ${(err as Error).name}`);
    }
    return { status: "fail", page };
  })();

  const [meta, mcp, video] = await Promise.all([oauthMeta, mcpChallenge, ownerVideo]);
  return { oauthMeta: meta, mcpChallenge: mcp, ownerVideo: video.status, ownerVideoPage: video.page, notes };
}
