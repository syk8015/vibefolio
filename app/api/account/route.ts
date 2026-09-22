import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { requireUser } from "@/lib/routeAuth";
import { getT } from "@/lib/i18n/server";
import { logger } from "@/lib/logger";
import { isR2Configured, deleteR2Prefix } from "@/lib/r2";
import { listFilesDeep, removeFiles } from "@/lib/storageList";

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

export async function DELETE() {
  const { t } = await getT();
  try {
    const auth = await requireUser(t.api.loginRequired);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;
    const uid = user.id;

    const admin = createAdminClient();

    // 1) Supabase Storage — everything under the user's prefix in both buckets.
    //    project-files/{uid}/…  and  avatars/{uid}/avatar.ext (+ legacy {uid}.ext at root).
    const projectFiles = await listFilesDeep(admin, "project-files", uid);
    const avatarFolder = await listFilesDeep(admin, "avatars", uid);
    const { data: avatarRoot } = await admin.storage
      .from("avatars")
      .list("", { limit: 1000, search: uid });
    const avatarLegacy = (avatarRoot ?? [])
      .filter((e) => e.id !== null && (e.name === uid || e.name.startsWith(`${uid}.`)))
      .map((e) => e.name);

    const sbRemoved =
      (await removeFiles(admin, "project-files", projectFiles)) +
      (await removeFiles(admin, "avatars", [...avatarFolder, ...avatarLegacy]));

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
      message: t.api.accountDeleteFailed,
      code: "INTERNAL",
      cause: err,
    });
  }
}
