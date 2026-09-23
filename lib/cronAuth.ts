import type { NextRequest } from "next/server";

// 외부 무료 크론(cron-job.org)이 부르는 /api/cron/* 의 공용 문지기. 비밀값은
// Authorization: Bearer 또는 ?key= 로 받는다(cron-job.org는 헤더 설정이 번거로워서).
export function authorizeCron(req: NextRequest): "ok" | "unconfigured" | "denied" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "unconfigured";
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return "ok";
  if (req.nextUrl.searchParams.get("key") === secret) return "ok";
  return "denied";
}
