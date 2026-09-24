import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { authorizeCron } from "@/lib/cronAuth";
import { runHandoffReminders } from "@/lib/handoffReminders";

// 폰 → 컴퓨터 넘기기 알림·정리를 손으로 한 번 돌리는 주소(찔러보기가 쓴다). 평소에는
// 5분마다 도는 점검 크론(/api/cron/health)이 같은 함수를 부르므로 따로 등록할 필요 없다.
// 권한 있는 호출엔 항상 200.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = authorizeCron(req);
  if (gate === "unconfigured") {
    return apiError({ status: 503, message: "CRON_SECRET not configured", code: "CRON_UNCONFIGURED" });
  }
  if (gate === "denied") {
    return apiError({ status: 401, message: "unauthorized", code: "UNAUTHORIZED", log: false });
  }
  const result = await runHandoffReminders(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
