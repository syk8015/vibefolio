import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { isR2Configured, presignR2Put, pruneR2PrefixExcept } from "@/lib/r2";
import { introFilmIssue } from "@/lib/introFilm/schema";
import { introFilmHash } from "@/lib/introFilm/hash";
import { BODY_TOO_LARGE, readJsonOr, MAX_MEDIUM_JSON_BYTES } from "@/lib/upload-safety";

// 소개 영상 파일 만들기(2026-10-02, docs/intro-film.md 5단계) — 맥 워커 전용.
//
// 명함(PC)·작품 페이지는 대본을 그 자리에서 그리므로 파일이 없어도 보인다. 파일은 폰 명함(동결 중이라
// 기존 영상 경로를 쓴다)·썸네일·공유용이다. 촬영 대기열(request_demo·할당량)과는 따로 간다: 돈이 드는
// 로봇 촬영이 아니라 우리 틀을 프레임 단위로 찍는 일이고, 대본이 바뀔 때마다(스타일·글자) 다시 만든다.
//   claim  — 공개된 작품 중 지문이 다른(=파일이 낡은) 하나를 집는다. 30분 안에 집은 건 건너뛴다.
//   sign   — {owner}/{id}/intro-{locale}-{ts}.mp4 + 포스터 서명 URL(키는 서버가 정한다).
//   done   — 지문이 아직 같을 때만 intro_render를 쓰고, 같은 폴더의 옛 intro-* 파일을 지운다.
//   failed — 같은 지문으로 끝없이 다시 집지 않게 실패를 적는다(대본이 바뀌면 다시 시도).
export const dynamic = "force-dynamic";

const CLAIM_TTL_MS = 30 * 60 * 1000;
type Render = {
  hash?: string; videos?: Record<string, string>; posters?: Record<string, string>; at?: string;
  claimed_hash?: string; claimed_at?: string; failed_hash?: string; error?: string;
};

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const admin = createAdminClient();
  try {
    const body = await readJsonOr(req, MAX_MEDIUM_JSON_BYTES, {});
    if (body === BODY_TOO_LARGE) return bodyTooLarge();
    const op = body?.op;

    if (op === "claim") {
      const { data, error } = await admin
        .from("projects")
        .select("id, user_id, intro_film, intro_render")
        .eq("is_draft", false)
        .not("intro_film", "is", null)
        .limit(200);
      if (error) throw error;
      const now = Date.now();
      for (const row of data ?? []) {
        if (introFilmIssue(row.intro_film)) continue;
        const hash = introFilmHash(row.intro_film);
        const r = (row.intro_render ?? {}) as Render;
        if (r.hash === hash || r.failed_hash === hash) continue;
        if (r.claimed_hash === hash && r.claimed_at && now - Date.parse(r.claimed_at) < CLAIM_TTL_MS) continue;
        const { error: upErr } = await admin
          .from("projects")
          .update({ intro_render: { ...r, claimed_hash: hash, claimed_at: new Date(now).toISOString() } })
          .eq("id", row.id);
        if (upErr) throw upErr;
        return NextResponse.json({ ok: true, job: { id: row.id, hash, locales: ["en", "ko"] } });
      }
      return NextResponse.json({ ok: true, job: null });
    }

    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
      return apiError({ status: 400, message: "projectId required", code: "BAD_REQUEST" });
    }
    const { data: row, error: rowErr } = await admin
      .from("projects").select("id, user_id, intro_film, intro_render").eq("id", projectId).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row?.user_id) return apiError({ status: 404, message: "project not found", code: "NOT_FOUND" });
    const prefix = `${row.user_id}/${row.id}/`;

    if (op === "sign") {
      if (!isR2Configured()) return apiError({ status: 503, message: "R2 not configured", code: "R2_UNCONFIGURED" });
      const locale = body?.locale === "ko" ? "ko" : "en";
      const ts = Date.now();
      const videoKey = `${prefix}intro-${locale}-${ts}.mp4`;
      const posterKey = `${prefix}intro-poster-${locale}-${ts}.jpg`;
      const video = await presignR2Put(videoKey, "video/mp4", 900);
      const poster = await presignR2Put(posterKey, "image/jpeg", 900);
      return NextResponse.json({ ok: true, ts, video: { key: videoKey, ...video }, poster: { key: posterKey, ...poster } });
    }

    const r = (row.intro_render ?? {}) as Render;
    const current = row.intro_film && !introFilmIssue(row.intro_film) ? introFilmHash(row.intro_film) : null;

    if (op === "done") {
      const hash = String(body?.hash ?? "");
      const videos = body?.videos as Record<string, string> | undefined;
      const posters = body?.posters as Record<string, string> | undefined;
      const tsList = Array.isArray(body?.ts) ? (body.ts as unknown[]).map(String).filter((t) => /^\d+$/.test(t)) : [];
      // 만드는 사이 주인이 대본을 또 고쳤으면 이 파일은 이미 낡았다 — 적지 않고 다음 claim이 새로 만든다.
      if (!current || hash !== current) return NextResponse.json({ ok: true, stale: true });
      const okUrl = (u: unknown) => typeof u === "string" && /^https:\/\//.test(u) && u.includes(`/${prefix}intro-`);
      if (!videos || !Object.values(videos).every(okUrl) || !posters || !Object.values(posters).every(okUrl)) {
        return apiError({ status: 400, message: "bad urls", code: "BAD_REQUEST" });
      }
      const { error } = await admin
        .from("projects")
        .update({ intro_render: { hash, videos, posters, at: new Date().toISOString() } })
        .eq("id", row.id);
      if (error) throw error;
      // 옛 파일 정리 — 이번 표식(ts)이 붙은 것만 남긴다. intro-* 안에서만(촬영 영상은 건드리지 않는다).
      if (tsList.length) {
        await pruneR2PrefixExcept(`${prefix}intro-`, tsList.map((t) => `-${t}.`)).catch((e) =>
          logger.warn("intro render prune failed", { error: e, projectId: row.id }));
      }
      return NextResponse.json({ ok: true });
    }

    if (op === "failed") {
      const hash = String(body?.hash ?? "");
      const message = String(body?.error ?? "").slice(0, 300);
      const { error } = await admin
        .from("projects").update({ intro_render: { ...r, failed_hash: hash, error: message } }).eq("id", row.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return apiError({ status: 400, message: "unknown op", code: "BAD_REQUEST" });
  } catch (err) {
    return apiError({ status: 500, message: "intro render op failed", code: "INTERNAL", cause: err });
  }
}
