// 페어링 코드(2026-09-16) prod E2E — 프롬프트에 박히던 raw 토큰을 1회용 코드로 대체한 경로.
//
// 왜 만들었나: [프롬프트 복사]는 살아 있는 PAT를 프롬프트 1단계에 박았고, 그 프롬프트는
// AI 채팅창에 붙여넣는 물건이라 크리덴셜이 대화 기록에 영구히 남았다(사용자 전역 규칙과 충돌).
// 이제 프롬프트엔 `nf_code_…`(30분·1회)만 들어가고 CLI `login <코드>`가 토큰으로 바꿔 받는다.
//
// 검증: (0) 테이블 존재 (1) 없는 코드 401 (2) code 필드 없음 400 (3) 살아있는 코드 → 토큰
// (4) 그 토큰이 PAT 경로에서 먹는다 (5) 재사용 401(1회용) (6) 만료 401 (7) used_at 스탬프
// (8) DB엔 해시만 (9)(10) 교환이 이전 prompt-auto를 폐기하고 활성 1개 (11) 코드를 Bearer로
// 쓰면 401 PAIRING_CODE + 안내 (12) 코드 발급은 세션 필수 (13) 교환 토큰 이름=prompt-auto.
//
// 사용: 레포 루트에서 `node scripts/probe-connect-code.mjs`
// ⚠️ 이 프로브는 **유저의 prompt-auto 자동 토큰을 갈아치운다**(센티널 규약 그대로) —
//    연결 프롬프트를 방금 복사해 AI가 작업 중이면 끝난 뒤에 돌릴 것. 끝나면 프로브가 만든
//    토큰·코드는 지우므로 활성 prompt-auto는 0이 되고, 다음 [프롬프트 복사]가 새로 만든다.
// 주의: 관리 버킷(ingest-manage 60/h) 2회, 교환 버킷(connect-exchange 20/h·IP) 6회 소비.
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const sha = (v) => createHash("sha256").update(v).digest("hex");

// (0) 마이그레이션이 먼저다 — 테이블이 없으면 발급·교환이 전부 500이다.
{
  const { error } = await svc.from("connect_codes").select("id").limit(1);
  ok("connect_codes 테이블 존재", !error, error ? `${error.code} ${error.message}` : "");
  if (error) {
    console.error("supabase/migration_connect_code.sql을 먼저 적용하세요.");
    process.exit(1);
  }
}

const { data: prof } = await svc
  .from("profiles")
  .select("id, username")
  .eq("username", "vivestarter")
  .maybeSingle();
if (!prof) {
  console.error("프로브 소유자(vivestarter) 프로필을 못 찾았어요.");
  process.exit(1);
}

const codeRows = [];
const tokenHashes = [];

/** 코드 한 장을 서버와 같은 모양으로 심는다(발급 라우트는 쿠키 경로라 프로브가 못 탄다). */
async function plantCode(minutesFromNow = 30) {
  const raw = `nf_code_${randomBytes(32).toString("base64url")}`;
  const { data, error } = await svc
    .from("connect_codes")
    .insert({
      user_id: prof.id,
      code_hash: sha(raw),
      expires_at: new Date(Date.now() + minutesFromNow * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`코드 심기 실패: ${error.message}`);
  codeRows.push(data.id);
  return raw;
}

const exchange = async (body) => {
  const res = await fetch(`${ORIGIN}/api/connect/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  // (1) 없는 코드 — 있는 코드와 같은 답이어야 한다(열거 실마리 없음).
  const unknown = await exchange({ code: `nf_code_${randomBytes(32).toString("base64url")}` });
  ok("없는 코드 → 401 CODE_INVALID", unknown.status === 401 && unknown.body?.code === "CODE_INVALID", `status ${unknown.status}`);
  ok(
    "거절 카피가 '다시 복사하라'고 말한다",
    typeof unknown.body?.error === "string" && /Connect tab/i.test(unknown.body.error) && /30 minutes/i.test(unknown.body.error),
    (unknown.body?.error ?? "").slice(0, 160),
  );

  // (2) 본문에 code가 없으면 400 — 교환할 게 없다.
  const bare = await exchange({});
  ok("code 없음 → 400", bare.status === 400 && bare.body?.code === "CODE_INVALID", `status ${bare.status}`);

  // (3) 살아 있는 코드 → 토큰. raw 토큰은 이 응답에만 있다.
  const good = await plantCode();
  const got = await exchange({ code: good });
  const token = got.body?.token;
  ok("살아있는 코드 → 200 + nf_live_ 토큰", got.status === 200 && typeof token === "string" && token.startsWith("nf_live_"),
    `status ${got.status} ${JSON.stringify(got.body).slice(0, 120)}`);
  if (typeof token === "string") tokenHashes.push(sha(token));

  // (4) 그 토큰이 실제로 PAT 경로에서 먹어야 교환이 의미가 있다(관리 버킷 — 발행 버킷 안 씀).
  if (token) {
    const res = await fetch(`${ORIGIN}/api/ingest/drafts`, { headers: { Authorization: `Bearer ${token}` } });
    ok("교환된 토큰이 PAT 경로에서 먹는다", res.status === 200, `status ${res.status}`);
  } else {
    ok("교환된 토큰이 PAT 경로에서 먹는다", false, "토큰을 못 받음");
  }

  // (5) 1회용 — 같은 코드를 다시 내면 죽어 있다(대화 기록에 남은 코드가 무해한 이유).
  const again = await exchange({ code: good });
  ok("같은 코드 재사용 → 401", again.status === 401 && again.body?.code === "CODE_INVALID", `status ${again.status}`);

  // (6) 만료된 코드도 같은 답.
  const stale = await plantCode(-1);
  const staleRes = await exchange({ code: stale });
  ok("만료된 코드 → 401", staleRes.status === 401, `status ${staleRes.status}`);

  // (7)(8) DB 쪽 사실: 소비 스탬프가 찍히고, 저장된 건 해시뿐이다.
  {
    const { data: row } = await svc
      .from("connect_codes")
      .select("code_hash, used_at")
      .eq("code_hash", sha(good))
      .maybeSingle();
    ok("교환된 코드에 used_at 스탬프", !!row?.used_at, JSON.stringify(row?.used_at));
    ok("DB엔 raw 코드가 아니라 sha256만", row?.code_hash === sha(good) && row?.code_hash !== good);
  }

  // (9)(10) 센티널 규약 — 교환은 이전 prompt-auto 토큰을 폐기하고 활성 1개만 남긴다.
  {
    const decoyRaw = `nf_live_${randomBytes(32).toString("base64url")}`;
    const { data: decoy } = await svc
      .from("api_tokens")
      .insert({
        user_id: prof.id,
        token_hash: sha(decoyRaw),
        token_prefix: `${decoyRaw.slice(0, 14)}…`,
        name: "prompt-auto",
      })
      .select("id")
      .single();
    tokenHashes.push(sha(decoyRaw));
    const code2 = await plantCode();
    const got2 = await exchange({ code: code2 });
    if (typeof got2.body?.token === "string") tokenHashes.push(sha(got2.body.token));
    const { data: after } = await svc.from("api_tokens").select("revoked_at").eq("id", decoy.id).maybeSingle();
    ok("교환이 이전 prompt-auto 토큰을 폐기", !!after?.revoked_at, JSON.stringify(after?.revoked_at));
    const { count } = await svc
      .from("api_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", prof.id)
      .eq("name", "prompt-auto")
      .is("revoked_at", null);
    ok("활성 prompt-auto 토큰은 1개", count === 1, `count ${count}`);
    ok("교환 토큰 이름 = prompt-auto(센티널)", count === 1);
  }

  // (11) 코드는 토큰이 아니다 — Bearer로 오면 "먼저 login하라"고 짚어준다(옛 CLI 조합).
  {
    const codeAsBearer = await plantCode();
    const res = await fetch(`${ORIGIN}/api/ingest/drafts`, {
      headers: { Authorization: `Bearer ${codeAsBearer}` },
    });
    const body = await res.json().catch(() => ({}));
    ok("코드를 Bearer로 쓰면 401 PAIRING_CODE", res.status === 401 && body?.code === "PAIRING_CODE", `status ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
    ok(
      "그 카피가 login 명령을 알려준다",
      typeof body?.error === "string" && /nookframe@latest login/.test(body.error),
      (body?.error ?? "").slice(0, 160),
    );
  }

  // (12) 코드 발급은 쿠키 세션 전용 — 인증 없이 코드를 받아갈 길이 없어야 한다.
  {
    const res = await fetch(`${ORIGIN}/api/connect/code`, { method: "POST" });
    ok("세션 없이 코드 발급 → 401", res.status === 401, `status ${res.status}`);
  }
} finally {
  if (codeRows.length) await svc.from("connect_codes").delete().in("id", codeRows);
  for (const hash of tokenHashes) await svc.from("api_tokens").delete().eq("token_hash", hash);
  console.log(`\n정리 완료: 코드 ${codeRows.length}건 · 토큰 ${tokenHashes.length}건`);
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
