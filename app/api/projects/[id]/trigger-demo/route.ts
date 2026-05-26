import { NextRequest, NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createClient } from "@/lib/supabase/server";
import { detectDemoSource } from "@/lib/demoSource";
import type { buildAndRecord } from "@/src/trigger/build-and-record";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: project, error: selErr } = await supabase
    .from("projects")
    .select("id, user_id, demo_url")
    .eq("id", id)
    .single();
  if (selErr || !project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (project.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const source = detectDemoSource(project.demo_url);
  if (!source || source.type !== "github") {
    return NextResponse.json(
      { error: "unsupported source", detected: source?.type ?? null },
      { status: 400 },
    );
  }

  const { error: updErr } = await supabase
    .from("projects")
    .update({
      demo_source_type: source.type,
      demo_source_value: source.value,
      demo_build_status: "pending",
      demo_build_error: null,
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const handle = await tasks.trigger<typeof buildAndRecord>("build-and-record", {
    projectId: id,
    sourceType: source.type,
    sourceValue: source.value,
  });

  return NextResponse.json({ ok: true, runId: handle.id, source });
}
