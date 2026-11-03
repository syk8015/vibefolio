import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// 외부 무료 크론(cron-job.org)이 부르는 /api/cron/* 의 공용 문지기. 비밀값은 Authorization: Bearer 헤더로 받는다.
// 주소(?key=)로 받던 길은 끈다(2026-11-03, 5단계 낮음 S1-F3·S7-F11·S9a-F6) — 주소는 Vercel 요청 기록·cron-job.org
// 기록에 그대로 남는다. cron-job.org 작업을 헤더 방식으로 바꾸는 동안만 ALLOW_QUERY_KEY를 켜 둔다.
// 비교는 고정 시간(길이가 달라도 해시로 맞춰 비교).
const ALLOW_QUERY_KEY = true;

function same(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function authorizeCron(req: NextRequest): "ok" | "unconfigured" | "denied" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "unconfigured";
  const auth = req.headers.get("authorization") ?? "";
  if (same(auth, `Bearer ${secret}`)) return "ok";
  const key = req.nextUrl.searchParams.get("key");
  if (ALLOW_QUERY_KEY && key !== null && same(key, secret)) return "ok";
  return "denied";
}
