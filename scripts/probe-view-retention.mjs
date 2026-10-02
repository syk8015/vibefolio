// 방문 기록 보관 기한 실서버 검사(2026-10-02, supabase/migration_view_retention.sql · lib/viewRetention.ts).
//
//   (1) 180일 지난 줄은 지워지고 그 수가 주인별 portfolio_view_totals에 더해진다, 최근 줄은 남는다
//   (2) 대시보드 '전체'(남은 줄 + 쌓아 둔 수)가 지우기 전과 같다 — 주인의 사용자 키로 계산
//   (3) 사용자 키로는 지우기 함수를 못 부르고 숫자 표에 못 쓴다, 남의 숫자·익명은 못 읽는다
//
// 지우기 함수는 크론과 같은 기준(180일)으로 부른다 — 실제 계정의 오래된 줄도 크론이 할 일 그대로 정리된다.
// 계정은 Resend 테스트 주소로 만들고 끝나면 지운다(줄·숫자는 계정과 함께 지워진다).
// 사용: `node scripts/probe-view-retention.mjs`
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const RETENTION_DAYS = 180; // lib/viewRetention.ts VIEW_RETENTION_DAYS와 같게
const DAY = 24 * 3_600_000;

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

const made = [];
const newUser = async (tag) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `delivered+nfprobe-vr${tag}-${stamp}@resend.dev`;
  const username = `nfprobevr${tag}${stamp}`.slice(0, 30);
  const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { username } });
  if (error) throw error;
  made.push(data.user.id);
  await svc.from("profiles").upsert({ id: data.user.id, username, name: "NF probe" });
  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  return { id: data.user.id, client };
};

const totalOf = async (client, id) => {
  const [{ count }, { data }] = await Promise.all([
    client.from("portfolio_views").select("id", { count: "exact", head: true }).eq("profile_id", id),
    client.from("portfolio_view_totals").select("archived_views").eq("profile_id", id).maybeSingle(),
  ]);
  return (count ?? 0) + Number(data?.archived_views ?? 0);
};

try {
  const owner = await newUser("a");
  const other = await newUser("b");
  const now = Date.now();
  const at = (days) => new Date(now - days * DAY).toISOString();
  const { error: insErr } = await svc.from("portfolio_views").insert([
    { profile_id: owner.id, viewed_at: at(RETENTION_DAYS + 20), referrer: "https://old.example/1" },
    { profile_id: owner.id, viewed_at: at(RETENTION_DAYS + 5), referrer: "https://old.example/2" },
    { profile_id: owner.id, viewed_at: at(RETENTION_DAYS + 1), referrer: "https://old.example/3" },
    { profile_id: owner.id, viewed_at: at(RETENTION_DAYS - 1), referrer: "https://recent.example/1" },
    { profile_id: owner.id, viewed_at: at(0), referrer: "https://recent.example/2" },
  ]);
  if (insErr) throw insErr;
  const before = await totalOf(owner.client, owner.id);

  // (3) 사용자 키로 부르기·쓰기 → 거절
  const { error: rpcErr } = await owner.client.rpc("archive_old_portfolio_views", { p_before: at(RETENTION_DAYS), p_limit: 2000 });
  ok("(3) 사용자 키로 지우기 함수 → 거절", !!rpcErr, rpcErr?.message ?? "불림");
  const { error: wErr } = await owner.client.from("portfolio_view_totals").insert({ profile_id: owner.id, archived_views: 999 });
  ok("(3) 사용자 키로 숫자 표에 쓰기 → 거절", !!wErr, wErr?.message ?? "써짐");

  // (1) 크론과 같은 기준으로 지우기 — 한 번에 안 끝나면(실제 오래된 줄이 많으면) 몇 번 더.
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const { data, error } = await svc.rpc("archive_old_portfolio_views", { p_before: at(RETENTION_DAYS), p_limit: 2000 });
    if (error) throw error;
    removed += Number(data ?? 0);
    if (!data) break;
  }
  const { data: left } = await svc.from("portfolio_views").select("referrer").eq("profile_id", owner.id);
  const refs = (left ?? []).map((r) => r.referrer).sort();
  ok("(1) 180일 지난 3줄 삭제 · 최근 2줄은 남음", refs.join() === "https://recent.example/1,https://recent.example/2", `${JSON.stringify(refs)} (전체 지운 줄 ${removed})`);
  const { data: tot } = await svc.from("portfolio_view_totals").select("archived_views, archived_through").eq("profile_id", owner.id).maybeSingle();
  ok("(1) 지운 수 3이 주인 숫자에 더해짐", Number(tot?.archived_views) === 3, JSON.stringify(tot));

  // (2) 대시보드 '전체'는 그대로
  const after = await totalOf(owner.client, owner.id);
  ok("(2) 대시보드 전체 = 지우기 전과 같음(5)", before === 5 && after === 5, `${before} → ${after}`);

  // (3) 남의 숫자·익명 읽기
  const { data: peek } = await other.client.from("portfolio_view_totals").select("archived_views").eq("profile_id", owner.id);
  ok("(3) 남의 숫자는 안 보임", (peek ?? []).length === 0, JSON.stringify(peek));
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: anonPeek } = await anon.from("portfolio_view_totals").select("archived_views").eq("profile_id", owner.id);
  ok("(3) 익명은 안 보임", (anonPeek ?? []).length === 0, JSON.stringify(anonPeek));
} finally {
  for (const id of made) {
    await svc.from("profiles").delete().eq("id", id);
    await svc.auth.admin.deleteUser(id);
  }
  if (made[0]) {
    const { data } = await svc.from("portfolio_view_totals").select("profile_id").eq("profile_id", made[0]);
    console.log(`  (정리: 계정 ${made.length}개 삭제 · 남은 숫자 줄 ${(data ?? []).length})`);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall view-retention probes passed");
process.exit(failed ? 1 : 0);
