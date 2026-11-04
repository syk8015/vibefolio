import { NextRequest, NextResponse } from "next/server";
import { requireMemeJob } from "@/lib/workerAuth";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { createAdminClient } from "@/lib/supabase/admin";
import { BODY_TOO_LARGE, readJsonOr, MAX_MEDIUM_JSON_BYTES } from "@/lib/upload-safety";
import { memeKey, parseMemeSubmission } from "@/lib/memeSubmit";

// 매일 밈 — 밤 작업(주인의 맥)이 그날 결과를 넣는 유일한 길(2026-11-04).
// MEME_SECRET 전용(워커 비밀로는 못 들어옴). 하는 일은 딱 둘: 그날 실행 기록 한 줄 +
// 후보를 '대기'로 넣기. 읽기·승인·공개·삭제는 이 길에 없다 — 공개는 /admin/memes에서
// 주인이 하나씩 승인할 때만. 비상 정지 '읽기 전용'이면 미들웨어가 먼저 막는다(기본 동작).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireMemeJob(req);
  if (denied) return denied;

  const body = await readJsonOr(req, MAX_MEDIUM_JSON_BYTES, null);
  if (body === BODY_TOO_LARGE) return bodyTooLarge();
  const parsed = parseMemeSubmission(body);
  if (!parsed.ok) {
    return apiError({ status: 400, message: parsed.message, code: "BAD_REQUEST", field: parsed.field });
  }

  try {
    const db = createAdminClient();
    const { data: run, error: runErr } = await db
      .from("meme_runs")
      .insert(parsed.run)
      .select("id")
      .single();
    if (runErr) throw runErr;

    // 같은 문구는 한 번만: 이번 묶음 안 겹침은 여기서 빼고, 이미 저장된 것과의 겹침은
    // 고유 색인(meme_lines_unique_text)이 23505로 알려 준다 → 그때만 줄마다 넣어 건너뛴다.
    const seen = new Set<string>();
    const fresh = parsed.lines.filter((l) => {
      const k = memeKey(l);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const rows = fresh.map((l) => ({ ...l, run_id: run.id, status: "pending" as const }));

    let inserted = 0;
    if (rows.length) {
      const { error } = await db.from("meme_lines").insert(rows);
      if (!error) inserted = rows.length;
      else if (error.code === "23505") {
        for (const row of rows) {
          const { error: one } = await db.from("meme_lines").insert(row);
          if (!one) inserted++;
          else if (one.code !== "23505") throw one;
        }
      } else throw error;
    }

    return NextResponse.json({
      ok: true,
      runId: run.id,
      inserted,
      skipped: parsed.lines.length - inserted,
    });
  } catch (err) {
    return apiError({ status: 500, message: "meme submit failed", code: "INTERNAL", cause: err });
  }
}
