import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { apiError, type ApiErrorBody } from "./apiError";
import { isAdminEmail } from "./adminEmails";
import { noteAdminDenied, noteAdminAllowed, noteAdminStepUp } from "./adminWatch";
import { noteAdminAction } from "./tripwire";
import { DEFAULT_HOME_COUNTRIES, needsStepUp, normalizeCountries } from "./adminStepUp";

// Cookie-session gates for API routes and server pages. Same contract as
// lib/workerAuth.ts (`requireWorker`): the helper either hands back what the
// route needs or the exact response to send. Callers:
//
//   const auth = await requireUser(t.api.loginRequired);
//   if (auth instanceof NextResponse) return auth;
//   const { user, supabase } = auth;
//
// The response bodies are byte-identical to what every route inlined before
// (2026-09-04 consolidation) — clients and probes depend on the codes.

type SessionClient = Awaited<ReturnType<typeof createClient>>;
export type RouteSession = { user: User; supabase: SessionClient };

export { isAdminEmail } from "./adminEmails";

/** Logged-in user or a 401 with the caller's localized message. */
export async function requireUser(
  loginRequired: string,
): Promise<RouteSession | NextResponse<ApiErrorBody>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return apiError({ status: 401, message: loginRequired, code: "UNAUTHORIZED" });
  }
  return { user, supabase };
}

/** 인증 앱(TOTP)을 등록해 확인까지 마쳤나. */
export function hasVerifiedTotp(user: User): boolean {
  return (user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
}

/** 집 나라 목록(system_status.admin_home_countries). 못 읽으면 기본값(KR) — 로그만 남긴다. */
async function adminHomeCountries(): Promise<string[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("system_status")
      .select("admin_home_countries")
      .eq("id", "singleton")
      .single();
    if (error) throw error;
    return normalizeCountries(data?.admin_home_countries);
  } catch (err) {
    logger.error("admin gate: home countries unreadable — using default", { error: err });
    return DEFAULT_HOME_COUNTRIES;
  }
}

export type AdminCheck =
  | { kind: "ok"; user: User; supabase: SessionClient }
  | { kind: "denied" }
  | { kind: "step-up"; user: User; supabase: SessionClient; country: string; hasFactor: boolean };

/**
 * 관리자 문 하나(화면·API 공용). 관리자가 아니면 denied(부른 쪽이 404),
 * 관리자라도 집 나라 밖에서 인증 앱 6자리 없이 왔으면 step-up(화면은 /admin/verify로, API는 404).
 * 기록·메일은 여기서 한다(lib/adminWatch.ts).
 */
export async function checkAdmin(where: string, opts: { skipStepUp?: boolean } = {}): Promise<AdminCheck> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    await noteAdminDenied(where, user);
    return { kind: "denied" };
  }
  if (!opts.skipStepUp) {
    // aal은 서명을 확인한 토큰에서 읽는다(getClaims). 쿠키 속 세션을 그대로 믿지 않는다.
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;
    const aal = claims && claims.sub === user.id ? claims.aal : null;
    const country = (await headers()).get("x-vercel-ip-country") ?? "?";
    if (needsStepUp({ country, aal, homes: await adminHomeCountries() })) {
      const hasFactor = hasVerifiedTotp(user);
      await noteAdminStepUp(where, user, country, hasFactor);
      return { kind: "step-up", user, supabase, country, hasFactor };
    }
  }
  await noteAdminAllowed(where, user);
  return { kind: "ok", user, supabase };
}

/** Admin user or a 404 — the endpoint must not reveal itself to non-admins. */
export async function requireAdmin(): Promise<RouteSession | NextResponse<ApiErrorBody>> {
  const gate = await checkAdmin("관리자 API");
  if (gate.kind !== "ok") {
    return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
  }
  const { user, supabase } = gate;
  // 관리자 API가 몰리면(훔친 세션으로 휘젓기) 그 계정 로그인을 끊고 막는다 — lib/tripwire.ts.
  if (!(await noteAdminAction(user))) {
    return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
  }
  return { user, supabase };
}
