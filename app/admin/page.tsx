import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/demoQuota";
import { AdminRequestList, type AdminRequestItem } from "./AdminRequestList";

// Internal approval console. Access is gated to ADMIN_EMAILS (lib/demoQuota); to
// everyone else this route simply 404s. Always rendered fresh — it's a queue.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: reqs } = await admin
    .from("demo_requests")
    .select("id, project_id, user_id, kind, reason, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const requests = reqs ?? [];
  const projectIds = [...new Set(requests.map((r) => r.project_id))];
  const userIds = [...new Set(requests.map((r) => r.user_id))];

  const { data: projects } = await admin
    .from("projects")
    .select("id, title, demo_url, demo_build_status, demo_video_url")
    .in("id", projectIds.length ? projectIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const pById = new Map((projects ?? []).map((p) => [p.id, p]));
  const uById = new Map((profiles ?? []).map((u) => [u.id, u]));

  const items: AdminRequestItem[] = requests.map((r) => {
    const p = pById.get(r.project_id);
    const u = uById.get(r.user_id);
    return {
      id: r.id,
      kind: r.kind as AdminRequestItem["kind"],
      reason: r.reason,
      createdAt: r.created_at,
      projectTitle: p?.title ?? "(삭제된 프로젝트)",
      demoUrl: p?.demo_url ?? null,
      hasVideo: !!p?.demo_video_url,
      username: u?.username ?? null,
    };
  });

  return (
    <main
      className="max-w-2xl mx-auto px-5 py-12"
      style={{ fontFamily: "var(--font-nunito)", color: "var(--text-primary)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <h1 className="vf-serif-display text-2xl">시연 영상 승인 대기</h1>
        <div className="flex gap-4">
          <Link href="/admin/metrics" className="text-sm vf-mono" style={{ color: "var(--text-muted)" }}>
            지표 →
          </Link>
          <Link href="/admin/ops" className="text-sm vf-mono" style={{ color: "var(--text-muted)" }}>
            관제 →
          </Link>
        </div>
      </div>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        재촬영 요청과 하루 한도 초과 보류 건이에요. 승인하면 바로 촬영 대기열로 들어가요.
      </p>
      <AdminRequestList items={items} />
    </main>
  );
}
