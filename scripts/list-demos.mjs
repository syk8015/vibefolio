// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase
  .from("projects")
  .select(
    "id, user_id, title, demo_source_type, demo_source_value, demo_build_status, demo_video_url, demo_generated_at, demo_build_error",
  )
  .order("demo_generated_at", { ascending: false, nullsFirst: false })
  .limit(15);

if (error) {
  console.error(error);
  process.exit(1);
}

for (const r of data) {
  console.log("---");
  console.log("id:", r.id);
  console.log("user_id:", r.user_id);
  console.log("title:", r.title);
  console.log("source:", r.demo_source_type, r.demo_source_value);
  console.log("status:", r.demo_build_status);
  console.log("generated:", r.demo_generated_at);
  console.log("video:", r.demo_video_url);
  if (r.demo_build_error) console.log("error:", r.demo_build_error.slice(0, 200));
}
