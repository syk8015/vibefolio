import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { identifyAgent, geoOf } from "@/lib/visitor";

// JS를 안 도는 로봇의 페이지 요청을 bot_visit으로 남긴다(2026-10-29, middleware에서 부름).
// landing_view·watch_view는 브라우저 JS가 보내므로 AI가 주소를 읽으러 온 것(ChatGPT-User…)과
// 메신저 링크 미리보기(Discordbot…)는 지금까지 0건으로 보였다. 미리보기 한 건 = 누가 그
// 서비스에 주소를 붙여 넣은 순간이라, 출처 모를 몰림의 답이 여기서 나온다.
//
// 이름 모를 로봇·스크립트(curl, UA 없음…)는 남기지 않는다 — 알고 싶은 건 AI·미리보기·검색이고,
// 주소를 바꿔 가며 훑는 스캐너가 요청마다 줄을 쌓게 두면 안 된다.
// 쌓이는 양의 상한 두 겹: 로봇 이름마다 10분에 AGENT_CAP건(넘으면 그 뒤는 안 씀), 그 안에서
// 같은 로봇·같은 주소는 10분에 한 번. 검색 로봇 UA를 흉내 낸 스캐너도 첫 겹에서 멈춘다.
// 한도기는 rl_touch를 바로 부른다(lib/rate-limit.ts는 node crypto를 써서 middleware에 못 싣는다).
// 실패는 전부 삼킨다 — 방문 기록이 페이지 응답을 막으면 안 된다.
const WINDOW_SECONDS = 600;
const AGENT_CAP = 60;

export function botVisitTask(request: NextRequest): Promise<void> | null {
  const agent = identifyAgent(request.headers.get("user-agent"));
  if (!agent || agent.kind === "script") return null;
  const path = request.nextUrl.pathname.slice(0, 200);
  return (async () => {
    try {
      const admin = createAdminClient();
      const touch = async (bucket: string, max: number) => {
        const { data } = await admin.rpc("rl_touch", {
          p_bucket: bucket,
          p_window_seconds: WINDOW_SECONDS,
          p_max: max,
        });
        return data === true;
      };
      if (!(await touch(`bot-visit-agent:${agent.name}`, AGENT_CAP))) return;
      if (!(await touch(`bot-visit:${agent.name}:${path}`, 1))) return;
      await admin.from("analytics_events").insert({
        event: AnalyticsEvent.BotVisit,
        props: { kind: agent.kind, agent: agent.name, path, country: geoOf(request.headers).country },
      });
    } catch {
      // 기록 실패는 조용히 넘긴다
    }
  })();
}
