// /api/track 요청 폭주 실서버 검사 (위협 목록 B1). 방문 기록은 한 IP당 분당 20번까지만 쌓여야 한다.
//
// 검증: (1) 한 IP에서 연달아 25번 → 기록은 정확히 20줄(나머지는 조용히 {ok:false})
// (2) 동시에 25번(경쟁 상태)에도 20줄을 안 넘음 (3) 요청마다 IP 헤더(x-forwarded-for·x-real-ip·
// x-vercel-forwarded-for)를 바꿔 끼워도 한도가 안 풀림 — Vercel이 진짜 IP로 덮어써야 한다
// (4) 사용자명 모양이 아니면 데이터 저장소까지 안 감.
//
// 방문 기록은 probe 계정에만 쌓이고 끝나면 계정째 지운다(남의 방문 수를 안 건드린다).
// 한 번 돌리면 이 IP의 track 창 1분이 가득 찬다 — 이어서 돌리려면 1분 기다릴 것.
// 사용: `node scripts/probe-track-flood.mjs`
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const rnd = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 223) + 1).join(".");
const hit = (username, spoof = false) =>
  fetch(`${ORIGIN}/api/track`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "nfprobe-track",
      ...(spoof ? { "x-forwarded-for": rnd(), "x-real-ip": rnd(), "x-vercel-forwarded-for": rnd() } : {}),
    },
    body: JSON.stringify({ username, referrer: "nfprobe" }),
  }).then((r) => r.json()).catch(() => ({ ok: "error" }));

const users = [];
const makeUser = async (tag) => {
  const stamp = `${Date.now()}${tag}`;
  const username = `nfprobetrk${stamp}`.slice(0, 30);
  const { data, error } = await svc.auth.admin.createUser({ email: `delivered+nfprobe-trk-${stamp}@resend.dev`, email_confirm: true, user_metadata: { username } });
  if (error) throw error;
  users.push(data.user.id);
  const { error: pErr } = await svc.from("profiles").upsert({ id: data.user.id, username, name: "NF probe" });
  if (pErr) throw pErr;
  return { id: data.user.id, username };
};
const rows = async (id) => (await svc.from("portfolio_views").select("id", { count: "exact", head: true }).eq("profile_id", id)).count ?? -1;

try {
  const a = await makeUser("a");
  const b = await makeUser("b");
  const c = await makeUser("c");

  // (1) 연달아 25번
  const seq = [];
  for (let i = 0; i < 25; i++) seq.push((await hit(a.username)).ok);
  const nA = await rows(a.id);
  ok("연달아 25번 → 기록 20줄", nA === 20, `기록=${nA} 응답 ok=${seq.filter((x) => x === true).length}`);

  // 같은 IP라 창이 이미 찼다 — 다른 계정도 막혀야 한다(한도는 IP 기준, 계정 기준 아님)
  const other = await hit(b.username);
  ok("창이 찬 IP는 다른 계정 기록도 막힘", other.ok === false && (await rows(b.id)) === 0, JSON.stringify(other));

  // (3) IP 헤더 바꿔 끼우기 — 창이 찬 상태에서 25번 더
  const spoofed = await Promise.all(Array.from({ length: 25 }, () => hit(c.username, true)));
  const nC = await rows(c.id);
  ok("IP 헤더를 바꿔 끼워도 한도 안 풀림", nC === 0, `기록=${nC} 응답 ok=${spoofed.filter((x) => x.ok === true).length}`);

  // (4) 모양 틀린 사용자명
  const bad = await hit("../../etc/passwd");
  ok("사용자명 모양 틀리면 거절", bad.ok === false, JSON.stringify(bad));

  console.log("- 1분 기다렸다가 동시 25번 검사…");
  await new Promise((r) => setTimeout(r, 62_000));
  // (2) 동시에 25번
  const par = await Promise.all(Array.from({ length: 25 }, () => hit(b.username)));
  const nB = await rows(b.id);
  ok("동시에 25번 → 기록 20줄 이하", nB <= 20 && nB > 0, `기록=${nB} 응답 ok=${par.filter((x) => x.ok === true).length}`);
} finally {
  for (const id of users) {
    await svc.from("portfolio_views").delete().eq("profile_id", id);
    await svc.from("profiles").delete().eq("id", id);
    await svc.auth.admin.deleteUser(id);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall track-flood probes passed");
process.exit(failed ? 1 : 0);
