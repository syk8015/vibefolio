import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { isR2Configured, r2PublicBase } from "@/lib/r2";
import { MAX_UPLOAD_BYTES, BODY_TOO_LARGE, readJsonOr, MAX_MEDIUM_JSON_BYTES } from "@/lib/upload-safety";
import { presignUserPut, userFilePathFromUrl, userStorage } from "@/lib/userStorage";
import { revalidatePortfolio } from "@/lib/revalidatePortfolio";
import { TRANSCODED_SUFFIX, isTranscodable } from "@/lib/videoTranscode";

// 주인이 올린 영상 줄이기(2026-10-02) — 맥 워커 전용. 휴대폰·화면 녹화 원본은 대개 필요 이상으로
// 무겁다(같은 화질로 50~80% 작아진다는 짐작, 파일마다 다르다). 촬영처럼 돈이 드는 일이 아니라 배치 때
// 촬영 대기열이 비면 한 편씩 한다. 원본은 바꾸기 전까지 그대로 재생된다.
//   claim — 공개 작품 중 우리 저장소(files/)에 있는 아직 안 줄인 영상 하나. skip = 이번 배치에서 실패한 id.
//   sign  — {uid}/videos/{UUID}-nf.mp4 서명 업로드(키·형식·크기는 서버가 정한다).
//   done  — video_url이 아직 그 원본일 때만 새 주소로 바꾸고(그사이 주인이 바꿨으면 새 파일을 지운다),
//           다른 작품이 안 쓰는 원본은 지운다.
// 끝 표시는 파일 이름(-nf.mp4)이다 — 새 칸(SQL) 없이 "이미 줄였나"를 안다.
export const dynamic = "force-dynamic";

type Row = { id: string; user_id: string; video_url: string | null };

/** 이 행 주인의 우리 저장소 파일 경로(files/ 아래)만. 남의 폴더·옛 Supabase 주소·바깥 주소는 null. */
function ownPath(row: Row, url: string | null | undefined): string | null {
  const p = userFilePathFromUrl(url);
  if (!p || p.legacy || p.bucket !== "project-files") return null;
  return p.path.startsWith(`${row.user_id}/`) ? p.path : null;
}

export async function POST(req: NextRequest) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const admin = createAdminClient();
  try {
    const body = await readJsonOr(req, MAX_MEDIUM_JSON_BYTES, {});
    if (body === BODY_TOO_LARGE) return bodyTooLarge();
    const op = body?.op;

    if (op === "claim") {
      const skip = new Set(Array.isArray(body?.skip) ? (body.skip as unknown[]).map(String) : []);
      const base = r2PublicBase();
      if (!base) return NextResponse.json({ ok: true, job: null });
      const { data, error } = await admin
        .from("projects")
        .select("id, user_id, video_url")
        .eq("is_draft", false)
        .like("video_url", `${base}/files/%`)
        .not("video_url", "like", `%${TRANSCODED_SUFFIX}`)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      for (const row of (data ?? []) as Row[]) {
        if (skip.has(row.id)) continue;
        const path = ownPath(row, row.video_url);
        if (!path || !isTranscodable(path)) continue;
        return NextResponse.json({ ok: true, job: { id: row.id, src: row.video_url } });
      }
      return NextResponse.json({ ok: true, job: null });
    }

    const projectId = typeof body?.projectId === "string" ? body.projectId : "";
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
      return apiError({ status: 400, message: "projectId required", code: "BAD_REQUEST" });
    }
    const { data: row, error: rowErr } = await admin
      .from("projects").select("id, user_id, video_url").eq("id", projectId).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row?.user_id) return apiError({ status: 404, message: "project not found", code: "NOT_FOUND" });

    if (op === "sign") {
      if (!isR2Configured()) return apiError({ status: 503, message: "R2 not configured", code: "R2_UNCONFIGURED" });
      const size = Number(body?.size);
      if (!Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
        return apiError({ status: 400, message: "bad size", code: "BAD_REQUEST" });
      }
      const path = `${row.user_id}/videos/${randomUUID()}${TRANSCODED_SUFFIX}`;
      const signed = await presignUserPut("project-files", path, size, "video/mp4");
      return NextResponse.json({ ok: true, target: { key: path, url: signed.url, headers: signed.headers, publicUrl: signed.publicUrl } });
    }

    if (op === "done") {
      const from = typeof body?.from === "string" ? body.from : "";
      const to = typeof body?.to === "string" ? body.to : "";
      const toPath = ownPath(row, to);
      if (!toPath || !toPath.startsWith(`${row.user_id}/videos/`) || !toPath.endsWith(TRANSCODED_SUFFIX)) {
        return apiError({ status: 400, message: "bad target", code: "BAD_REQUEST" });
      }
      const fromPath = ownPath(row, from);
      // 그사이 주인이 영상을 바꿨거나 지웠다 — 새 파일은 쓸 데가 없으니 지우고 끝.
      const { data: swapped, error: upErr } = await admin
        .from("projects").update({ video_url: to }).eq("id", row.id).eq("video_url", from).select("id");
      if (upErr) throw upErr;
      if (!swapped?.length) {
        await userStorage.from("project-files").remove([toPath]);
        return NextResponse.json({ ok: true, stale: true });
      }
      // 원본은 다른 작품이 같은 주소를 쓰지 않을 때만 지운다(같은 파일을 두 작품에 건 경우).
      if (fromPath) {
        const { count } = await admin
          .from("projects").select("id", { count: "exact", head: true }).eq("video_url", from);
        if (!count) {
          const { error: rmErr } = await userStorage.from("project-files").remove([fromPath]);
          if (rmErr) logger.warn("video transcode: original not removed", { error: rmErr, projectId: row.id });
        }
      }
      revalidatePortfolio();
      return NextResponse.json({ ok: true });
    }

    return apiError({ status: 400, message: "unknown op", code: "BAD_REQUEST" });
  } catch (err) {
    return apiError({ status: 500, message: "video transcode op failed", code: "INTERNAL", cause: err });
  }
}
