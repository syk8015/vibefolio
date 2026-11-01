import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import { requireAdmin } from "@/lib/routeAuth";
import { sendEmail, alertRecipients } from "@/lib/email";
import { adminAlertEmail, SITE_URL } from "@/lib/email-templates";
import { logger } from "@/lib/logger";
import { BODY_TOO_LARGE, readJsonOr, MAX_SMALL_JSON_BYTES } from "@/lib/upload-safety";

// 비상 정지 버튼(2026-11-02, supabase/migration_stop_buttons.sql · lib/siteLock.ts).
//   { action: "readonly", on }  사이트 읽기 전용 켜기/끄기
//   { action: "uploads",  on }  업로드 닫기/열기
//   { action: "revoke" }        AI 연결 토큰·연결 코드·로그인 전부 끊기(되돌릴 수 없음)
// 누를 때마다 관리자에게 메일이 간다 — 관리자 세션을 훔친 사람이 눌러도 바로 알게.
// 이 주소는 읽기 전용 중에도 열려 있다(/api/admin/ — 잠금을 풀 길이 막히면 안 된다).

export const dynamic = "force-dynamic";

const ACTION_LABEL = {
  readonly: { on: "사이트를 읽기 전용으로 잠갔어요", off: "사이트 읽기 전용을 풀었어요" },
  uploads: { on: "업로드를 닫았어요", off: "업로드를 다시 열었어요" },
} as const;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = await readJsonOr(req, MAX_SMALL_JSON_BYTES, {});
  if (body === BODY_TOO_LARGE) return bodyTooLarge();
  const action: unknown = body?.action;
  const admin = createAdminClient();
  const h = await headers();
  const who = `${user.email ?? user.id} · 나라 ${h.get("x-vercel-ip-country") ?? "?"}`;

  try {
    if (action === "readonly" || action === "uploads") {
      if (typeof body?.on !== "boolean") {
        return apiError({ status: 400, message: "on은 true/false여야 해요.", code: "BAD_REQUEST" });
      }
      const column = action === "readonly" ? "site_readonly_at" : "uploads_closed_at";
      const { error } = await admin
        .from("system_status")
        .update({ [column]: body.on ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq("id", "singleton");
      if (error) throw error;
      const title = ACTION_LABEL[action][body.on ? "on" : "off"];
      logger.warn(`stop: ${action}=${body.on}`, { by: user.id });
      await notify(title, [
        `누가: ${who}`,
        body.on
          ? "모든 서버에 퍼지기까지 길어야 5초 걸려요. 풀 때는 관제탑의 같은 자리에서 눌러요."
          : "모든 서버에 퍼지기까지 길어야 5초 걸려요.",
      ]);
      return NextResponse.json({ ok: true, action, on: body.on });
    }

    if (action === "revoke") {
      const { data, error } = await admin.rpc("admin_revoke_all_access");
      if (error) throw error;
      const counts = (data ?? {}) as { tokens?: number; codes?: number; sessions?: number };
      logger.warn("stop: revoked all access", { by: user.id, ...counts });
      await notify("연결·로그인을 전부 끊었어요", [
        `누가: ${who}`,
        `AI 연결 토큰 ${counts.tokens ?? 0}개 · 연결 코드 ${counts.codes ?? 0}개 · 로그인 ${counts.sessions ?? 0}개를 끊었어요.`,
        "이미 열린 화면은 길어야 1시간 안에 로그아웃돼요. 워커 열쇠·서비스 키는 이 버튼으로 안 바뀌어요 — 직접 바꿔야 해요.",
      ]);
      return NextResponse.json({ ok: true, action, ...counts });
    }

    return apiError({ status: 400, message: "모르는 조치예요.", code: "BAD_REQUEST" });
  } catch (err) {
    return apiError({ status: 500, message: "조치에 실패했어요. 다시 눌러 주세요.", code: "INTERNAL", cause: err });
  }
}

async function notify(title: string, lines: string[]) {
  try {
    await sendEmail({
      to: alertRecipients(),
      ...adminAlertEmail({ title: `비상 정지 · ${title}`, lines, ctaLabel: "비상 정지 열기", ctaUrl: `${SITE_URL}/admin#stop` }),
    });
  } catch (err) {
    logger.error("stop: notify mail failed", { error: err });
  }
}
