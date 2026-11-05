import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { MEMES_TAG } from "@/lib/memeLive";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";
import { BODY_TOO_LARGE, readJsonOr, MAX_SMALL_JSON_BYTES } from "@/lib/upload-safety";
import { MEME_TRANSITIONS, parseMemeReview } from "@/lib/memeReview";

// 매일 밈 검토(2026-11-05) — /admin/memes의 버튼들. 관리자만(requireAdmin: 집 나라 밖은 인증 앱 6자리 뒤).
//   { id, op: "publish", text?, reply? }  대기 → 공개(고친 글이 있으면 바꾸고 edited=true)
//   { id, op: "drop" }                    대기 → 버림
//   { id, op: "retire" }                  공개 → 내림(홈에서 빠짐)
//   { id, op: "restore" }                 버림·내림 → 다시 대기
// 상태는 조건부로만 바꾼다(지금 상태가 맞을 때만) — 두 창에서 눌러도 한쪽만 된다(409).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await readJsonOr(req, MAX_SMALL_JSON_BYTES, null);
  if (body === BODY_TOO_LARGE) return bodyTooLarge();
  const parsed = parseMemeReview(body);
  if (!parsed.ok) return apiError({ status: 400, message: parsed.message, code: "BAD_REQUEST", field: parsed.field });

  const { id, op, edit } = parsed;
  const t = MEME_TRANSITIONS[op];
  const patch: Record<string, unknown> = { status: t.to, reviewed_at: new Date().toISOString() };
  if (edit) Object.assign(patch, { text: edit.text, reply: edit.reply, edited: true });

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("meme_lines")
      .update(patch)
      .eq("id", id)
      .in("status", t.from)
      .select("id, status, text, reply, edited, reviewed_at");
    if (error?.code === "23505") {
      return apiError({ status: 409, message: "고친 글과 같은 문구가 이미 있어요.", code: "DUPLICATE", field: "text" });
    }
    if (error) throw error;
    if (!data?.length) {
      return apiError({ status: 409, message: "그사이 상태가 바뀌었어요. 새로고침해 주세요.", code: "STALE" });
    }
    // 홈이 읽는 공개 줄 캐시(lib/memeLive.ts)를 비워 공개·내리기가 바로 보이게.
    revalidateTag(MEMES_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, line: data[0] });
  } catch (err) {
    return apiError({ status: 500, message: "저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.", code: "INTERNAL", cause: err });
  }
}
