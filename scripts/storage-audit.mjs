// One-off storage audit: walk every bucket, sum object sizes by bucket + extension.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
if (bErr) { console.error("listBuckets:", bErr); process.exit(1); }

const fmt = (b) => {
  if (b > 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (b > 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + " MB";
  if (b > 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
};

async function walk(bucket, prefix, acc) {
  const queue = [prefix];
  while (queue.length) {
    const dir = queue.shift();
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(dir, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) { console.error(`list ${bucket}/${dir}:`, error.message); break; }
      if (!data || data.length === 0) break;
      for (const e of data) {
        const full = dir ? `${dir}/${e.name}` : e.name;
        if (e.id === null) {
          queue.push(full);
        } else {
          const size = e.metadata?.size ?? 0;
          const ext = (e.name.split(".").pop() || "noext").toLowerCase();
          acc.total += size;
          acc.count += 1;
          acc.byExt[ext] = acc.byExt[ext] || { size: 0, count: 0 };
          acc.byExt[ext].size += size;
          acc.byExt[ext].count += 1;
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
}

let grand = 0;
for (const bucket of buckets) {
  const acc = { total: 0, count: 0, byExt: {} };
  await walk(bucket.name, "", acc);
  grand += acc.total;
  console.log(`\n=== bucket: ${bucket.name} (public=${bucket.public}) ===`);
  console.log(`  total: ${fmt(acc.total)} across ${acc.count} objects`);
  const exts = Object.entries(acc.byExt).sort((a, b) => b[1].size - a[1].size);
  for (const [ext, s] of exts) {
    console.log(`    .${ext.padEnd(8)} ${fmt(s.size).padStart(10)}  (${s.count} files)`);
  }
}
console.log(`\n=== GRAND TOTAL across all buckets: ${fmt(grand)} ===`);
