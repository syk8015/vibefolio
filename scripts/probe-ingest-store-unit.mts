// 인제스트 zip 저장(2026-09-22 트래픽7·데이터2). 네트워크 없음 — 가짜 스토리지 클라이언트.
// 지키는 것: ①파일을 동시에 여러 개(상한 8) 올린다 ②하나가 실패하면 날아간 요청이 다
// 끝난 뒤에 던진다(정리와 엇갈리지 않게) ③실패로 되돌린 새 행은 폴더 파일까지 지운다.
import JSZip from "jszip";
import { storeZipBundle, dropNewRow } from "../lib/ingestStore";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const zip = new JSZip();
zip.file("index.html", "<!doctype html><html><body>hi</body></html>");
for (let i = 0; i < 60; i++) zip.file(`assets/a${i}.js`, `console.log(${i})`);
const buf = await zip.generateAsync({ type: "arraybuffer" });

function fakeAdmin(failKey?: string) {
  const stored = new Set<string>();
  let inFlight = 0;
  let peak = 0;
  let afterThrow = 0;
  let thrown = false;
  const deletedRows: string[] = [];
  const admin = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight--;
          if (thrown) afterThrow++;
          if (path === failKey) return { error: { message: "boom" } };
          stored.add(path);
          return { error: null };
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: p } }),
        list: async (dir: string, opts: { limit?: number; offset?: number }) => {
          const kids = new Map<string, boolean>();
          for (const k of stored) {
            if (!k.startsWith(`${dir}/`)) continue;
            const rest = k.slice(dir.length + 1);
            const [head, ...more] = rest.split("/");
            kids.set(head, more.length > 0 || kids.get(head) === true);
          }
          const all = [...kids].map(([name, isDir]) => ({ name, id: isDir ? null : name }));
          const off = opts.offset ?? 0;
          return { data: all.slice(off, off + (opts.limit ?? 100)), error: null };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) stored.delete(p);
          return { error: null };
        },
      }),
    },
    from: () => ({ delete: () => ({ eq: async (_c: string, v: string) => { deletedRows.push(v); } }) }),
  };
  return {
    admin, stored, deletedRows,
    peak: () => peak, markThrown: () => { thrown = true; }, afterThrow: () => afterThrow,
  };
}

const good = fakeAdmin();
const res = await storeZipBundle(good.admin, "u", "p", buf);
ok("61개 전부 올라감", good.stored.size === 61 && res.keys.length === 61);
ok("동시에 여러 개(2~8)", good.peak() > 1 && good.peak() <= 8, `peak=${good.peak()}`);

const bad = fakeAdmin("u/p/assets/a10.js");
let err: unknown = null;
try {
  await storeZipBundle(bad.admin, "u", "p", buf);
} catch (e) {
  err = e;
  bad.markThrown();
}
await new Promise((r) => setTimeout(r, 30));
ok("하나 실패 → 던짐", !!err && (err as { code?: string }).code === "upload-failed");
ok("던진 뒤엔 늦게 끝나는 업로드 없음", bad.afterThrow() === 0, `late=${bad.afterThrow()}`);
ok("실패 뒤 새 업로드를 멈춤", bad.stored.size < 60, `stored=${bad.stored.size}`);

await dropNewRow(bad.admin, "u", "p");
ok("새 행 되돌리기 → 행 삭제", bad.deletedRows.includes("p"));
ok("새 행 되돌리기 → 폴더 파일도 0", bad.stored.size === 0, `left=${bad.stored.size}`);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
