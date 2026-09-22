// 스토리지 폴더 통째 나열(2026-09-22 데이터1). 네트워크 없음 — 가짜 스토리지 클라이언트.
// 지키는 것: 한 폴더에 1000개가 넘어도(zip은 2000개 허용) 전부 나열한다 — 예전 삭제
// 경로 셋은 첫 페이지만 봐서 1001번째부터 탈퇴·삭제 뒤에도 공개 버킷에 남았다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { listFilesDeep, removeFiles, STORAGE_LIST_PAGE } from "../lib/storageList";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 가짜 트리: u/p/ 아래 파일 2500개 + 하위 폴더 assets/ 아래 1200개 + 빈 폴더 empty/
const tree: Record<string, { name: string; id: string | null }[]> = {
  "u/p": [
    ...Array.from({ length: 2500 }, (_, i) => ({ name: `f${i}.js`, id: `id${i}` })),
    { name: "assets", id: null },
    { name: "empty", id: null },
  ],
  "u/p/assets": Array.from({ length: 1200 }, (_, i) => ({ name: `a${i}.png`, id: `a${i}` })),
  "u/p/empty": [],
};
const removed: string[] = [];
let maxLimit = 0;
const fake = {
  storage: {
    from: () => ({
      list: async (dir: string, opts: { limit: number; offset?: number }) => {
        maxLimit = Math.max(maxLimit, opts.limit);
        const all = tree[dir] ?? [];
        const off = opts.offset ?? 0;
        return { data: all.slice(off, off + opts.limit), error: null };
      },
      remove: async (paths: string[]) => {
        if (paths.length > 100) return { error: { message: "too many" } };
        removed.push(...paths);
        return { error: null };
      },
    }),
  },
} as unknown as SupabaseClient;

const files = await listFilesDeep(fake, "project-files", "u/p");
ok("2500개 폴더 전부 나열", files.filter((f) => /^u\/p\/f\d+\.js$/.test(f)).length === 2500);
ok("하위 폴더 1200개도 나열", files.filter((f) => f.startsWith("u/p/assets/")).length === 1200);
ok("폴더 플레이스홀더는 파일로 안 셈", !files.includes("u/p/assets") && !files.includes("u/p/empty"));
ok(`한 번에 ${STORAGE_LIST_PAGE}개 넘게 묻지 않음`, maxLimit === STORAGE_LIST_PAGE);

const n = await removeFiles(fake, "project-files", files);
ok("전부 지움(100개씩)", n === 3700 && removed.length === 3700);

const broken = {
  storage: { from: () => ({ list: async () => ({ data: null, error: { message: "boom" } }) }) },
} as unknown as SupabaseClient;
let threw = false;
try {
  await listFilesDeep(broken, "project-files", "u/p");
} catch {
  threw = true;
}
ok("나열 실패는 조용히 넘기지 않고 던짐(행 삭제 전에 멈춤)", threw);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
