import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { apiError, type ApiErrorBody } from "./apiError";
import { isAdminEmail } from "./adminEmails";

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

/** Admin user or a 404 — the endpoint must not reveal itself to non-admins. */
export async function requireAdmin(): Promise<RouteSession | NextResponse<ApiErrorBody>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
  }
  return { user, supabase };
}
