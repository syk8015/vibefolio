import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/cronAuth";
import { apiError } from "@/lib/apiError";
import { listFilesDeep } from "@/lib/storageList";
import { userStorage, userFilePathFromUrl, userFilePublicUrl, type UserBucket } from "@/lib/userStorage";

// 한 번 쓰고 지우는 옮기기(2026-10-01) — 옛 Supabase 버킷(project-files·avatars)의 파일을 R2의 같은
// 경로(lib/userStorage.ts)로 복사하고, DB의 옛 공개 주소(썸네일·영상·프로필 사진)를 R2 주소로 바꾼다.
// 크론 비밀값으로만 부른다. ?dry=1이면 세기만. 끝나면 이 파일을 지우고 Supabase 버킷을 닫는다.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKETS: UserBucket[] = ["project-files", "avatars"];

export async function POST(req: NextRequest) {
  const auth = authorizeCron(req);
  if (auth !== "ok") return apiError({ status: 401, message: "unauthorized", code: "UNAUTHORIZED" });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  try {
    const admin = createAdminClient();
    const copied: Record<string, number> = {};
    const failures: string[] = [];
    for (const bucket of BUCKETS) {
      // 맨 위 폴더(사용자 id)마다 끝까지 내려간다.
      const { data: top, error } = await admin.storage.from(bucket).list("", { limit: 1000 });
      if (error) throw new Error(`list ${bucket}: ${error.message}`);
      const paths: string[] = [];
      for (const e of top ?? []) {
        if (e.id === null) paths.push(...(await listFilesDeep(admin, bucket, e.name)));
        else paths.push(e.name);
      }
      copied[bucket] = 0;
      for (const path of paths) {
        if (dry) { copied[bucket]++; continue; }
        const { data, error: dlErr } = await admin.storage.from(bucket).download(path);
        if (dlErr || !data) { failures.push(`${bucket}/${path}: download ${dlErr?.message}`); continue; }
        const { error: upErr } = await userStorage.from(bucket).upload(path, data, { contentType: data.type });
        if (upErr) { failures.push(`${bucket}/${path}: upload ${upErr.message}`); continue; }
        copied[bucket]++;
      }
    }

    // DB 주소 바꾸기 — 옛 Supabase 공개 주소만.
    const rewrite = (url: string | null): string | null => {
      const r = userFilePathFromUrl(url);
      if (!r || !r.legacy) return null;
      const q = url!.includes("?") ? url!.slice(url!.indexOf("?")) : "";
      return userFilePublicUrl(r.bucket, r.path) + q;
    };
    let rows = 0;
    const { data: projects, error: pErr } = await admin.from("projects").select("id, thumbnail, video_url");
    if (pErr) throw pErr;
    for (const p of projects ?? []) {
      const thumbnail = rewrite(p.thumbnail as string | null);
      const video_url = rewrite(p.video_url as string | null);
      if (!thumbnail && !video_url) continue;
      rows++;
      if (!dry) {
        const { error: uErr } = await admin.from("projects").update({
          ...(thumbnail ? { thumbnail } : {}), ...(video_url ? { video_url } : {}),
        }).eq("id", p.id);
        if (uErr) failures.push(`project ${p.id}: ${uErr.message}`);
      }
    }
    const { data: profiles, error: prErr } = await admin.from("profiles").select("id, avatar_url");
    if (prErr) throw prErr;
    for (const p of profiles ?? []) {
      const avatar_url = rewrite(p.avatar_url as string | null);
      if (!avatar_url) continue;
      rows++;
      if (!dry) {
        const { error: uErr } = await admin.from("profiles").update({ avatar_url }).eq("id", p.id);
        if (uErr) failures.push(`profile ${p.id}: ${uErr.message}`);
      }
    }
    return NextResponse.json({ ok: failures.length === 0, dry, copied, rowsRewritten: rows, failures });
  } catch (err) {
    return apiError({ status: 500, message: "migration failed", code: "INTERNAL", cause: err });
  }
}
