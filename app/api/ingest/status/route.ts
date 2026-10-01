import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { filmingStatus, filmingSummary, type FilmingRow } from "@/lib/filmingStatus";
import { ingestAuth, pickApiT } from "../shared";

// GET /api/ingest/status[?id=<작품 id>] — 외부 AI가 "영상 다 찍혔어?"를 직접 묻는 곳
// (2026-10-02, 09-17 외부 AI 피드백 ⓑ). 판정은 lib/filmingStatus.ts.
//
// 초안만 보여 주는 /api/ingest/drafts와 달리 **공개된 작품도 보인다** — 촬영은 공개한
// 다음에야 시작되니, 초안만 보이면 정작 궁금한 순간에 작품이 사라진다. 그래도 PAT의
// 폭발반경은 그대로다: 여기는 읽기 전용이고, 토큰 주인의 작품만, 촬영에 관한 칸만 낸다
// (공개 작품의 내용을 바꾸는 길은 여전히 없다 — 재촬영도 대기 대본 + 주인 확인).
// 남의 작품 id는 "없음"과 같은 404로 답한다(있는지 없는지도 알려 주지 않는다).
//
// 지워진 초안과 공개된 초안을 AI가 가려낼 수 있게 된 것도 덤이다(NF-19: 공개된 걸
// 모르고 같은 앱을 또 올린 사고) — 공개면 state=public, 지워졌으면 404.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_MAX = 50;

// 촬영 상태 판정에 필요한 칸만. demo_build_error·pending_*는 비공개 칸이지만 여기는
// 서버가 토큰 주인을 확인한 뒤 관리자 권한으로 읽는 자리다(대시보드 /api/projects/private와 같은 구조).
const COLS =
  "id, title, is_draft, created_at, demo_build_status, demo_build_error, demo_video_url, demo_generated_at, " +
  "demo_status_changed_at, demo_attempt_count, demo_locale_videos, video_url, pending_demo_script, pending_script_at, pending_script_note";

type Row = FilmingRow & { id: string; title: string; created_at: string };

export async function GET(req: NextRequest) {
  try {
    const auth = await ingestAuth(req);
    if (auth.fail) return auth.fail;
    const { userId, t } = auth;

    // 발행·초안 관리와 다른 버킷 — AI가 상태를 몇 번 물어도 발행 쿼터가 줄지 않게.
    const allowed = await rateLimit({ name: "ingest-status", key: userId, windowSeconds: 3600, max: 120 });
    if (!allowed) {
      return apiError({ status: 429, message: t.api.tooManyRequests, code: "RATE_LIMITED" });
    }

    const id = req.nextUrl.searchParams.get("id")?.trim() || null;
    if (id && !UUID_RE.test(id)) {
      return apiError({ status: 400, message: "id must be a work id (a UUID from a publish result or the drafts list).", code: "BAD_ID" });
    }

    const admin = createAdminClient();
    let q = admin.from("projects").select(COLS).eq("user_id", userId);
    q = id ? q.eq("id", id) : q.order("created_at", { ascending: false }).limit(LIST_MAX);
    const [{ data, error }, paused, username] = await Promise.all([
      q.returns<Row[]>(),
      readPaused(admin),
      readUsername(admin, userId),
    ]);
    if (error) {
      return apiError({ status: 500, message: t.api.retryLater, code: "DB_SELECT_FAILED", cause: error });
    }
    if (id && !data?.length) {
      return apiError({
        status: 404,
        message: "No work with this id among your works. It may have been deleted (published works stay listed here).",
        code: "NOT_FOUND",
      });
    }

    const nowMs = Date.now();
    const origin = req.nextUrl.origin;
    const works = (data ?? []).map((r) => {
      const isDraft = !!r.is_draft;
      const filming = filmingStatus(r, { paused, nowMs });
      return {
        id: r.id,
        title: r.title,
        state: isDraft ? "draft" : "public",
        createdAt: r.created_at,
        reviewUrl: isDraft ? `${origin}/dashboard?review=${r.id}` : null,
        publicUrl: !isDraft && username ? `${origin}/${username}/${r.id}` : null,
        summary: filmingSummary({ id: r.id, title: r.title, isDraft }, filming),
        filming,
      };
    });

    return NextResponse.json(
      id
        ? { ok: true, filmingPaused: paused, work: works[0] }
        : { ok: true, filmingPaused: paused, count: works.length, works },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    const tc = await pickApiT(req);
    return apiError({ status: 500, message: tc.api.retryLater, code: "INTERNAL", cause: err });
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * 몰아서 찍기 모드인가(system_status.demo_paused). 읽다 실패하면 false — /api/demo/status와
 * 같은 판단: 멀쩡할지도 모르는 파이프라인을 "멈춤"이라 말하는 쪽이 더 나쁜 거짓말이다.
 */
async function readPaused(admin: Admin): Promise<boolean> {
  const { data, error } = await admin.from("system_status").select("demo_paused").eq("id", "singleton").maybeSingle();
  if (error) {
    logger.warn("ingest status: system_status read failed", { error });
    return false;
  }
  return !!data?.demo_paused;
}

async function readUsername(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
  return (data?.username as string | undefined) || null;
}
