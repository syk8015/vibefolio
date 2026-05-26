import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase.storage
  .from("project-files")
  .list("_test", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

if (error) {
  console.error("list failed:", error);
  process.exit(1);
}

console.log("_test/ entries:");
for (const e of data) console.log(" ", e.name, e.metadata?.size ?? "-", e.created_at);

if (data.length > 0) {
  const latest = data[0];
  const sub = await supabase.storage
    .from("project-files")
    .list(`_test/${latest.name}`, { limit: 10 });
  console.log(`\n_test/${latest.name}/ entries:`);
  for (const e of sub.data ?? []) console.log(" ", e.name, e.metadata?.size ?? "-");

  const { data: urlData } = supabase.storage
    .from("project-files")
    .getPublicUrl(`_test/${latest.name}/demo.mp4`);
  console.log("\npublic url:", urlData.publicUrl);
}
