import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { rateLimit, clientIpKey } from "@/lib/rate-limit";
import { trackServerEvent } from "@/lib/analytics";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { HANDOFF_TTL_MS, isHandoffId } from "@/lib/handoff";

// POST /api/handoff/open — 컴퓨터에서 메일 링크(/signup?h=<id>)가 열렸을 때 가입 화면이
// 부른다. 돌려주는 건 그 행의 이메일(칸 채우기)과 폰의 first-touch(광고 출처 잇기)뿐.
// 처음 열린 때만 opened_at을 찍고 handoff_opened를 센다 — 알림 크론은 열린 행을 건너뛴다.
//
// 모르는 id·30일 지난 id는 모두 { ok:false } 한 모양(무엇이 틀렸는지 말하지 않는다).
// id는 추측 불가 uuid지만 IP당 분당 20번으로 한 번 더 막는다.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = body?.id;
    if (!isHandoffId(id)) return NextResponse.json({ ok: false });
    if (!(await rateLimit({ name: "handoff-open", key: clientIpKey(req), windowSeconds: 60, max: 20 }))) {
      return NextResponse.json({ ok: false });
    }

    const admin = createAdminClient();
    const since = new Date(Date.now() - HANDOFF_TTL_MS).toISOString();
    const { data: row, error } = await admin
      .from("desktop_handoffs")
      .select("id, email, first_touch, opened_at")
      .eq("id", id)
      .gte("created_at", since)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ ok: false });

    if (!row.opened_at) {
      // 두 탭이 동시에 열어도 한 번만 센다 — 아직 null인 행만 갱신.
      const { data: stamped } = await admin
        .from("desktop_handoffs")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", id)
        .is("opened_at", null)
        .select("id");
      if (stamped && stamped.length > 0) {
        const ft = (row.first_touch ?? {}) as Record<string, string | null>;
        await trackServerEvent(AnalyticsEvent.HandoffOpened, {
          props: {
            handoff: id,
            utm_source: ft.utm_source ?? null,
            utm_medium: ft.utm_medium ?? null,
            utm_campaign: ft.utm_campaign ?? null,
          },
        });
      }
    }

    return NextResponse.json({ ok: true, email: row.email, firstTouch: row.first_touch ?? null });
  } catch (err) {
    return apiError({ status: 500, message: "handoff open failed", code: "INTERNAL", cause: err });
  }
}
