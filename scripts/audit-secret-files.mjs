// 스토리지 소급 감사 — 이미 올라간 객체 중 비밀/내부 파일이 있는지 훑는다.
// 업로드 필터(2026-09-01) 이전에 올라간 것과, 브라우저 직행 업로드처럼 서버를
// 안 거치는 경로를 잡기 위한 사후 그물. 정기적으로 다시 돌려도 된다.
//
// 판정은 lib/upload-safety.ts의 secretFileKind를 그대로 쓴다 — 감사와 차단이
// 갈라지면 "감사는 깨끗한데 실제로는 새는" 상태가 되므로 목록을 복제하지 않는다.
// 그 밖에 비밀은 아니지만 안 올라가는 게 나은 것(에디터 설정·로컬 DB)은 참고로만.
//
// 사용: node scripts/audit-secret-files.mjs
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { secretFileKind } from "../lib/upload-safety.ts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// 차단 대상은 아니지만 눈에 띄면 알려주는 것들(정보용 — 실패로 세지 않는다).
const NOTABLE = [
  [/(^|\/)\.DS_Store$/i, ".DS_Store"],
  [/(^|\/)\.vscode(\/|$)|(^|\/)\.idea(\/|$)/i, "에디터 설정"],
  [/\.(sqlite3?|db)$/i, "로컬 DB 파일"],
  [/(^|\/)terraform\.tfstate/i, "tfstate"],
];

const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
if (bErr) { console.error("listBuckets:", bErr); process.exit(1); }

async function walk(bucket, prefix, out) {
  const queue = [prefix];
  while (queue.length) {
    const dir = queue.shift();
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(dir, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) { console.error(`list ${bucket}/${dir}:`, error.message); break; }
      if (!data || data.length === 0) break;
      for (const e of data) {
        const full = dir ? `${dir}/${e.name}` : e.name;
        if (e.id === null) queue.push(full);
        else out.push({ path: full, size: e.metadata?.size ?? 0 });
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
}

let secrets = 0;
for (const b of buckets) {
  const objects = [];
  await walk(b.name, "", objects);
  // 스토리지 키는 `{uid}/{rowId}/{상대경로}` — 앞의 두 세그먼트를 떼야 업로드
  // 시점과 같은 상대경로로 판정된다(안 떼면 uid가 경로 앞에 붙어 `(^|/)` 매치는
  // 그대로 되지만, 의미를 맞춰두는 편이 나중에 규칙을 고칠 때 안전하다).
  const rel = (p) => p.split("/").slice(2).join("/") || p;
  const hits = [];
  const notable = [];
  for (const o of objects) {
    const kind = secretFileKind(rel(o.path));
    if (kind) { hits.push({ ...o, kind }); continue; }
    const n = NOTABLE.find(([re]) => re.test(`/${o.path}`));
    if (n) notable.push({ ...o, label: n[1] });
  }
  secrets += hits.length;
  console.log(`\n=== ${b.name} (public=${b.public}) — 객체 ${objects.length}개`);
  console.log(`  비밀 파일 ${hits.length}개 · 참고 ${notable.length}개`);
  for (const h of hits) console.log(`  ⚠️ [${h.kind}] ${h.path} (${h.size}B)`);
  for (const n of notable) console.log(`  · [${n.label}] ${n.path} (${n.size}B)`);
}

console.log(secrets
  ? `\n⚠️ 비밀 파일 ${secrets}개 — 삭제 후 소유자에게 키 교체를 알릴 것`
  : "\n✓ 비밀 파일 0개");
process.exit(secrets ? 1 : 0);
