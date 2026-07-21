import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { apiError } from "@/lib/apiError";
import { logger } from "@/lib/logger";
import { isR2Configured, deleteR2Prefix } from "@/lib/r2";

// Self-serve account deletion — honours the privacy policy's "탈퇴 즉시 파기".
//
// Purges the user's storage (Supabase project-files + avatars) and R2, THEN deletes
// the auth user. Deleting auth.users cascades: profiles → projects → demo_moderation /
// demo_requests are removed; analytics_events / demo_events / content_reports keep the
// row but null the user link (de-identified, so aggregates survive without PII).
//
// Storage is purged FIRST so a failure aborts BEFORE the account is gone — nothing is
// half-deleted and the user can retry. The auth deletion (irreversible) runs last.
// Runs with the service-role key: RLS can't delete auth users, and storage RLS would
// otherwise silently skip objects (same reason the per-project delete uses it).

async function listUserObjects(
  admin: SupabaseClient,
  bucket: string,
  rootDir: string,
): Promise<string[]> {
  const paths: string[] = [];
  const queue = [rootDir];
  while (queue.length) {
    const dir = queue.shift()!;
    const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    if (error) throw new Error(`list ${bucket}/${dir} failed: ${error.message}`);
    for (const entry of data ?? []) {
      const full = `${dir}/${entry.name}`;
      if (entry.id === null) queue.push(full); // directory placeholder → descend
      else paths.push(full);
    }
  }
  return paths;
}

async function removeAll(admin: SupabaseClient, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw new Error(`remove ${bucket} failed: ${error.message}`);
    removed += chunk.length;
  }
  return removed;
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return apiError({ status: 401, message: "로그인이 필요해요.", code: "UNAUTHORIZED" });
    }
    const uid = user.id;

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1) Supabase Storage — everything under the user's prefix in both buckets.
    //    project-files/{uid}/…  and  avatars/{uid}/avatar.ext (+ legacy {uid}.ext at root).
    const projectFiles = await listUserObjects(admin, "project-files", uid);
    const avatarFolder = await listUserObjects(admin, "avatars", uid);
    const { data: avatarRoot } = await admin.storage
      .from("avatars")
      .list("", { limit: 1000, search: uid });
    const avatarLegacy = (avatarRoot ?? [])
      .filter((e) => e.id !== null && (e.name === uid || e.name.startsWith(`${uid}.`)))
      .map((e) => e.name);

    const sbRemoved =
      (await removeAll(admin, "project-files", projectFiles)) +
      (await removeAll(admin, "avatars", [...avatarFolder, ...avatarLegacy]));

    // 2) Cloudflare R2 — demo assets under the user prefix.
    let r2Removed = 0;
    if (isR2Configured()) {
      r2Removed = await deleteR2Prefix(`${uid}/`);
    }

    // 3) Auth user — cascades the DB rows. Irreversible, so it goes last.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) throw new Error(`auth deleteUser failed: ${delErr.message}`);

    logger.info("account deleted", { userId: uid, sbRemoved, r2Removed });
    return NextResponse.json({ ok: true, sbRemoved, r2Removed });
  } catch (err) {
    return apiError({
      status: 500,
      message: "탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
      code: "INTERNAL",
      cause: err,
    });
  }
}
