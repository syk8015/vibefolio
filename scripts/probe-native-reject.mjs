// 못 찍는 네이티브 앱 — 거절 카피 + 수요 계측 prod E2E (2026-08-26).
//   (1) 배포 대기 — iOS zip이 NATIVE_APP_UNSUPPORTED로 거절될 때까지 폴링
//       (구코드는 같은 zip을 UPLOAD_FAILED/index-html-missing으로 거절한다)
//   (2) iOS·안드로이드·Unity zip → 400 + 코드 NATIVE_APP_UNSUPPORTED + 플랫폼 이름이 담긴 카피
//   (3) 문서만 있는 zip → 여전히 옛 거절(회귀 가드: 네이티브로 뭉개지면 안 됨)
//   (4) bare RN zip → **수락**(package.json 앵커 — 웹빌드 경로를 잃지 않았는지)
//   (5) analytics_events에 native_app_rejected가 플랫폼별로 쌓였는지
//   끝나면 throwaway 행·스토리지·토큰·프로브 이벤트 정리.
// 사용: node scripts/probe-native-reject.mjs  (ingest 레이트리밋 20/h — 폴링 포함 ~10회 소비)
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.loadEnvFile(".env.local");
const ORIGIN = "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 픽스처 — 각 플랫폼의 "가장 흔한 첫 커밋" 모양.
const S = mkdtempSync(join(tmpdir(), "nf-probe-native-"));
const put = (dir, rel, body) => {
  const full = join(S, dir, rel);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, body);
};
put("ios", "MyApp.xcodeproj/project.pbxproj", "// !$*UTF8*$!\n{ archiveVersion = 1; }\n");
put("ios", "MyApp/ContentView.swift", "import SwiftUI\nstruct ContentView: View { var body: some View { Text(\"hi\") } }\n");
put("android", "app/src/main/AndroidManifest.xml", "<manifest package=\"com.probe\" />\n");
put("android", "build.gradle.kts", "plugins { id(\"com.android.application\") }\n");
put("android", "app/src/main/java/MainActivity.kt", "class MainActivity\n");
put("unity", "ProjectSettings/ProjectVersion.txt", "m_EditorVersion: 6000.0.30f1\n");
put("unity", "Assets/Scenes/Main.unity", "%YAML 1.1\n");
put("docs", "README.md", "# just notes\n");
// bare RN: ios/·android/를 품지만 package.json이 먼저 앵커를 잡아야 한다.
put("rn", "package.json", JSON.stringify({ name: "probe-rn", dependencies: { "react-native": "0.76.0" } }));
put("rn", "App.js", "export default () => null;\n");
put("rn", "ios/App.xcodeproj/project.pbxproj", "// !$*UTF8*$!\n");
put("rn", "android/build.gradle", "// gradle\n");
for (const d of ["ios", "android", "unity", "docs", "rn"]) {
  execFileSync("zip", ["-qr", join(S, `${d}.zip`), "."], { cwd: join(S, d) });
}

// 발행 게이트(2026-08-25)를 통과할 최소 대본 — 이게 없으면 zip 처리에 닿기도 전에
// SCRIPT_REQUIRED로 튕긴다.
const SCRIPT = {
  steps: [
    { goal: "첫 화면", selector: "#a", action: "click" },
    { goal: "두 번째", selector: "#b", action: "click" },
    { goal: "세 번째", selector: "#c", action: "click" },
  ],
};

// 소유자를 "첫 번째 프로필"로 집으면 계정이 늘거나 사라질 때 대상이 조용히 바뀐다
// (08-26에 계정 하나를 지우면서 실제로 바뀔 뻔했다). 관리자 계정으로 못 박는다.
const OWNER_EMAIL = process.env.PROBE_OWNER_EMAIL || "vivestarter@gmail.com";
const { data: owner } = await svc.auth.admin.listUsers({ perPage: 200 });
const ownerUser = owner?.users?.find((u) => u.email === OWNER_EMAIL);
const { data: prof } = ownerUser
  ? await svc.from("profiles").select("id").eq("id", ownerUser.id).maybeSingle()
  : { data: null };
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc
  .from("api_tokens")
  .insert({
    user_id: prof.id,
    token_hash: createHash("sha256").update(raw).digest("hex"),
    token_prefix: `${raw.slice(0, 14)}…`,
    name: "__probe_native_delete_me__",
  })
  .select("id")
  .single();

const postZip = async (name, title) => {
  const form = new FormData();
  // 대본 게이트 다음에 로그인 게이트(2026-08-27)가 있다 — 둘 다 통과해야
  // zip 처리까지 내려가 네이티브 거절 카피를 볼 수 있다.
  form.set("payload", JSON.stringify({ title, demoScript: SCRIPT, demoAccess: { noLogin: true } }));
  form.set("bundle", new Blob([readFileSync(join(S, `${name}.zip`))], { type: "application/zip" }), "bundle.zip");
  const res = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}` },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// 스토리지는 **BFS로** 훑는다: list()는 한 단계만 보여줘서 평면 목록만 지우면
// ios/App.xcodeproj/… 같은 하위 폴더가 그대로 남는다(2026-08-26에 실제로 남겼다 —
// 계정 탈퇴 경로가 대신 치워줬다). app/api/account의 listUserObjects와 같은 방식.
const listAll = async (bucket, root) => {
  const out = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift();
    const { data } = await svc.storage.from(bucket).list(dir, { limit: 1000 });
    for (const e of data ?? []) {
      const full = `${dir}/${e.name}`;
      if (e.id === null) queue.push(full); // 디렉터리 자리표시자 → 내려간다
      else out.push(full);
    }
  }
  return out;
};

const wipeProject = async (pid) => {
  const keys = await listAll("project-files", `${prof.id}/${pid}`);
  for (let i = 0; i < keys.length; i += 100) {
    await svc.storage.from("project-files").remove(keys.slice(i, i + 100));
  }
  await svc.from("projects").delete().eq("id", pid);
};

const made = [];
const startedAt = new Date().toISOString();
try {
  // (1) 배포 대기 — 최대 5분.
  let ios = null;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    ios = await postZip("ios", "__probe_native_ios__");
    if (ios.body?.code === "NATIVE_APP_UNSUPPORTED") break;
    console.log(`  … 배포 대기 (status ${ios.status} code ${ios.body?.code})`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  ok("(2) iOS zip 400", ios?.status === 400, `status ${ios?.status}`);
  ok("(2) iOS 코드 NATIVE_APP_UNSUPPORTED", ios?.body?.code === "NATIVE_APP_UNSUPPORTED", JSON.stringify(ios?.body).slice(0, 200));
  ok("(2) iOS 카피에 플랫폼 이름", /iOS/.test(ios?.body?.error ?? ios?.body?.message ?? ""), JSON.stringify(ios?.body).slice(0, 200));

  const and = await postZip("android", "__probe_native_android__");
  ok("(2) 안드로이드 400 + 코드", and.status === 400 && and.body?.code === "NATIVE_APP_UNSUPPORTED", JSON.stringify(and.body).slice(0, 200));
  ok("(2) 안드로이드 카피", /안드로이드|Android/.test(and.body?.error ?? and.body?.message ?? ""), JSON.stringify(and.body).slice(0, 160));

  const uni = await postZip("unity", "__probe_native_unity__");
  ok("(2) Unity 400 + 코드", uni.status === 400 && uni.body?.code === "NATIVE_APP_UNSUPPORTED", JSON.stringify(uni.body).slice(0, 200));
  ok("(2) Unity 카피", /Unity/.test(uni.body?.error ?? uni.body?.message ?? ""), JSON.stringify(uni.body).slice(0, 160));

  // (3) 회귀 가드 — 문서만 있는 zip은 네이티브가 아니라 기존 거절이어야 한다.
  const docs = await postZip("docs", "__probe_native_docs__");
  ok("(3) 문서 zip은 400", docs.status === 400, `status ${docs.status}`);
  ok("(3) 문서 zip은 네이티브로 뭉개지지 않음", docs.body?.code !== "NATIVE_APP_UNSUPPORTED", JSON.stringify(docs.body).slice(0, 160));

  // (4) bare RN은 여전히 수락 — 여기서 막히면 웹빌드 경로를 통째로 잃은 것.
  const rn = await postZip("rn", "__probe_native_rn__");
  ok("(4) bare RN zip 수락", rn.status === 200, `status ${rn.status} ${JSON.stringify(rn.body).slice(0, 160)}`);
  if (rn.status === 200) {
    made.push(rn.body.projectId);
    const { data: row } = await svc.from("projects").select("demo_url").eq("id", rn.body.projectId).single();
    ok("(4) RN demo_url = package.json 앵커", row?.demo_url?.endsWith("/package.json"), row?.demo_url);
  }

  // (5) 수요 계측이 실제로 쌓였는지.
  const { data: evs } = await svc
    .from("analytics_events")
    .select("props")
    .eq("event", "native_app_rejected")
    .eq("user_id", prof.id)
    .gte("created_at", startedAt);
  const platforms = new Set((evs ?? []).map((e) => e.props?.platform));
  ok("(5) native_app_rejected 3건 이상", (evs?.length ?? 0) >= 3, `${evs?.length ?? 0}건`);
  ok("(5) 플랫폼 3종 기록", ["ios", "android", "unity"].every((p) => platforms.has(p)), [...platforms].join(","));
  ok("(5) source=zip", (evs ?? []).every((e) => e.props?.source === "zip"), JSON.stringify(evs?.[0]?.props));
} finally {
  for (const pid of made) await wipeProject(pid);
  const { data: leftovers } = await svc.from("projects").select("id").like("title", "__probe_native_%");
  for (const r of leftovers ?? []) await wipeProject(r.id);
  if (tok) await svc.from("api_tokens").delete().eq("id", tok.id);
  // 프로브가 만든 계측 이벤트는 지운다 — /admin의 수요 숫자를 오염시키면 안 된다.
  const { error: evDelErr } = await svc
    .from("analytics_events")
    .delete()
    .eq("event", "native_app_rejected")
    .eq("user_id", prof.id)
    .gte("created_at", startedAt);
  console.log(`[cleanup] rows=${made.length} token·프로브 이벤트 삭제${evDelErr ? ` (이벤트 정리 실패: ${evDelErr.message})` : " 완료"}`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
