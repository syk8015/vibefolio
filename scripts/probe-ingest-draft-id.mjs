// draftId 교체 발행 prod E2E(2026-09-15) — 갱신할 초안을 URL 대신 id로 지정하는 경로.
// (0) 배포 감지: 없는 draftId → 404 (1) URL 초안 생성 (2) draftId로 URL을 바꿔 갱신 = 같은 행·새 행 없음
// (2b) newDraft = 같은 URL에도 새 초안(앞 초안 유지) (2c) newDraft + draftId → 400
// (3) 폴더(zip) 초안 생성 (4) draftId로 zip 교체 = 같은 행·옛 파일 삭제 (5) 불량 zip 교체 → 초안 유지
// (6) 공개된 행 draftId → 409 (7) zip 초안을 URL로 교체 → 옛 zip 파일 삭제
// (8) 같은 URL 재발행 + 불량 스크린샷 → 초안 유지(교체 표식) (9) 새 URL 행 + 불량 영상 → 행 삭제(고아 정리 유지)
//
// 사용: 레포 루트에서 `node scripts/probe-ingest-draft-id.mjs` — 배포가 끝난 뒤에(감지는 한 번만 한다).
// 주의: ingest 레이트리밋(유저 20/h)을 판당 18회 소비 — 창은 첫 요청부터 1시간이라, 같은 시간에
// 다른 ingest 프로브와 같이 돌리면 429.
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPublish } from "../cli/src/publish.js";

const ORIGIN = "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 인제스트 게이트(대본·로그인 답·소개글·대상 화면)를 통과시키는 최소 페이로드 — 관심사는 갱신 대상 판정.
const GATE = {
  demoScript: {
    steps: [
      { goal: "첫 화면 확인", where: "본문", action: "scroll", expect: "내용이 보인다" },
      { goal: "주요 버튼", where: "첫 버튼", action: "click", expect: "반응한다" },
      { goal: "결과 확인", where: "결과 영역", action: "focus", expect: "결과가 보인다" },
      { goal: "상단 힌트", where: "상단 제목", action: "hover", expect: "설명이 뜬다" },
    ],
  },
  demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
  targetDevice: "desktop",
  description: "프로브가 만든 임시 행\n곧 지워집니다",
};

// 픽스처 폴더 — site1(old.txt 있음) → site2(old.txt 없음·new.txt) → site3(웹페이지도 실행 코드도 없음).
const S = mkdtempSync(join(tmpdir(), "nf-probe-draftid-"));
const site = (name, entries) => {
  const dir = join(S, name);
  mkdirSync(dir);
  for (const [f, body] of Object.entries(entries)) writeFileSync(join(dir, f), body);
  return dir;
};
const SITE1 = site("site1", { "index.html": "<!doctype html><h1>v1</h1>", "old.txt": "only in v1" });
const SITE2 = site("site2", { "index.html": "<!doctype html><h1>v2</h1>", "new.txt": "only in v2" });
const SITE3 = site("site3", { "readme.md": "no page, no runnable code" });

const { data: prof } = await svc.from("profiles").select("id").limit(1).maybeSingle();
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_e2e_delete_me__",
}).select("id").single();

const post = async (path, body) => {
  const res = await fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
// 행 폴더의 한 겹 파일 이름(폴더 제외).
const files = async (pid, sub = "") => {
  const prefix = `${prof.id}/${pid}${sub ? `/${sub}` : ""}`;
  const { data } = await svc.storage.from("project-files").list(prefix, { limit: 100 });
  return (data ?? []).filter((f) => f.id).map((f) => f.name).sort();
};
const rowOf = async (pid) =>
  (await svc.from("projects").select("id, title, demo_url, is_draft").eq("id", pid).maybeSingle()).data;
const wipeProject = async (pid) => {
  for (const sub of ["", "_media", "_upload"]) {
    const prefix = `${prof.id}/${pid}${sub ? `/${sub}` : ""}`;
    const names = await files(pid, sub);
    if (names.length) await svc.storage.from("project-files").remove(names.map((n) => `${prefix}/${n}`));
  }
  await svc.from("projects").delete().eq("id", pid);
};
const cleanupAll = async () => {
  const { data } = await svc.from("projects").select("id").like("title", "__probe_%");
  for (const r of data ?? []) await wipeProject(r.id);
  await svc.from("api_tokens").delete().eq("id", tok.id);
  rmSync(S, { recursive: true, force: true });
};

const R = randomBytes(4).toString("hex");
const U = (s) => `https://example.com/probe-did-${R}-${s}`;
const publish = (payload, dir) => runPublish({ payload: { ...GATE, ...payload }, dir, token: raw, origin: ORIGIN });

try {
  // (0) 배포 감지 — 없는 draftId는 게이트보다 먼저 404. 옛 코드는 draftId를 모른 채 소개글
  // 게이트(400)에서 멈추므로 감지 요청이 행을 만들지 않는다.
  const d0 = await post("/api/ingest", { title: "__probe_did_detect__", draftId: "00000000-0000-4000-8000-000000000000" });
  ok("(0) 배포 감지: 없는 draftId → 404 NOT_FOUND", d0.status === 404 && d0.body.code === "NOT_FOUND", `${d0.status} ${d0.body.code}`);
  if (d0.status !== 404) throw new Error("새 코드가 아직 배포되지 않았다 — 배포가 끝난 뒤 다시");

  // (1)(2) URL 초안 → draftId로 URL을 바꿔 갱신.
  const a1 = await post("/api/ingest", { ...GATE, title: "__probe_did_A1__", deployUrl: U("a") });
  const A = a1.body.projectId;
  ok("(1) URL 초안 생성", a1.status === 200 && !!A && !a1.body.upserted, `${a1.status} ${JSON.stringify(a1.body).slice(0, 120)}`);
  const a2 = await post("/api/ingest", { ...GATE, title: "__probe_did_A2__", deployUrl: U("b"), draftId: A });
  const rowA = await rowOf(A);
  const { count: dupB } = await svc.from("projects").select("id", { count: "exact", head: true }).eq("demo_url", U("b"));
  ok("(2) draftId + 새 URL → 같은 행 갱신(title·demo_url), 새 행 없음",
    a2.status === 200 && a2.body.projectId === A && a2.body.upserted === true &&
      rowA?.title === "__probe_did_A2__" && rowA?.demo_url === U("b") && dupB === 1,
    `${a2.status} ${JSON.stringify(rowA)} dup=${dupB}`);

  // (2b)(2c) newDraft — 같은 URL이어도 앞 초안을 남기고 새로 만든다. draftId와 동시 사용은 400.
  const e1 = await post("/api/ingest", { ...GATE, title: "__probe_did_E1__", deployUrl: U("e") });
  const e2 = await post("/api/ingest", { ...GATE, title: "__probe_did_E2__", deployUrl: U("e"), newDraft: true });
  const { count: dupE } = await svc.from("projects").select("id", { count: "exact", head: true }).eq("demo_url", U("e"));
  ok("(2b) newDraft → 같은 URL에도 새 초안(앞 초안 유지)",
    e2.status === 200 && !!e2.body.projectId && e2.body.projectId !== e1.body.projectId && !e2.body.upserted && dupE === 2,
    `${e2.status} ${e1.body.projectId}→${e2.body.projectId} dup=${dupE}`);
  const conf = await post("/api/ingest", { ...GATE, title: "__probe_did_CONF__", deployUrl: U("e"), newDraft: true, draftId: A });
  ok("(2c) newDraft + draftId 동시 → 400", conf.status === 400, `${conf.status} ${conf.body.code}`);

  // (3)(4) 폴더 초안 → draftId로 zip 교체(CLI runPublish 2단계 그대로).
  const b1 = await publish({ title: "__probe_did_B1__" }, SITE1);
  const B = b1.projectId;
  const filesB1 = await files(B ?? "none");
  ok("(3) 폴더(zip) 초안 생성 — old.txt 포함", !!B && filesB1.includes("old.txt"), JSON.stringify(filesB1));
  const b2 = await publish({ title: "__probe_did_B2__", draftId: B }, SITE2);
  const rowB = await rowOf(B);
  const filesB = await files(B);
  const { count: nB } = await svc.from("projects").select("id", { count: "exact", head: true }).like("title", "__probe_did_B%");
  ok("(4) draftId + 새 zip → 같은 행·upserted, 새 행 없음",
    b2.projectId === B && b2.upserted === true && rowB?.title === "__probe_did_B2__" && nB === 1,
    `${JSON.stringify(b2).slice(0, 120)} rows=${nB}`);
  ok("(4) 옛 파일(old.txt) 삭제 · 새 파일(new.txt) 있음 · demo_url=새 index.html",
    !filesB.includes("old.txt") && filesB.includes("new.txt") &&
      !!rowB?.demo_url?.startsWith(`/api/preview/${prof.id}/${B}/`) && rowB.demo_url.endsWith("index.html"),
    `${JSON.stringify(filesB)} ${rowB?.demo_url}`);

  // (5) 불량 zip 교체(웹페이지·실행 코드 없음) → finalize 거절, 초안은 남는다(교체 표식).
  let err5 = null;
  try {
    await publish({ title: "__probe_did_B3__", draftId: B }, SITE3);
  } catch (e) {
    err5 = e instanceof Error ? e.message : String(e);
  }
  const rowB5 = await rowOf(B);
  const filesB5 = await files(B);
  const upload5 = await files(B, "_upload");
  ok("(5) 불량 zip 교체는 거절된다", !!err5, err5 ?? "no error");
  ok("(5) 거절돼도 초안·파일·주소가 그대로(행 삭제 안 함)",
    !!rowB5 && rowB5.demo_url === rowB?.demo_url && filesB5.includes("new.txt") && filesB5.includes("index.html"),
    `${JSON.stringify(rowB5)} ${JSON.stringify(filesB5)}`);
  ok("(5) 임시 파일·교체 표식 정리됨(_upload 비어 있음)", upload5.length === 0, JSON.stringify(upload5));

  // (6) 공개된 행에 draftId → 409(is_draft 플립으로 시뮬).
  await svc.from("projects").update({ is_draft: false }).eq("id", A);
  const a6 = await post("/api/ingest", { ...GATE, title: "__probe_did_A6__", deployUrl: U("b"), draftId: A });
  await svc.from("projects").update({ is_draft: true }).eq("id", A);
  const rowA6 = await rowOf(A);
  ok("(6) 공개된 행 draftId → 409 NOT_DRAFT, 행 불변",
    a6.status === 409 && a6.body.code === "NOT_DRAFT" && rowA6?.title === "__probe_did_A2__",
    `${a6.status} ${a6.body.code} ${rowA6?.title}`);

  // (7) zip 초안을 URL로 교체 → 옛 zip 파일 전부 삭제.
  const b7 = await post("/api/ingest", { ...GATE, title: "__probe_did_B7__", deployUrl: U("c"), draftId: B });
  const rowB7 = await rowOf(B);
  const filesB7 = await files(B);
  ok("(7) draftId + URL → zip 초안이 URL 초안으로, 옛 zip 파일 삭제",
    b7.status === 200 && b7.body.projectId === B && rowB7?.demo_url === U("c") && filesB7.length === 0,
    `${b7.status} ${rowB7?.demo_url} ${JSON.stringify(filesB7)}`);

  // (8) 같은 URL 재발행 + 불량 스크린샷 → finalize가 거절해도 기존 초안은 남는다(예전엔 지워졌다).
  const a8 = await post("/api/ingest", { ...GATE, title: "__probe_did_A8__", deployUrl: U("b"), uploads: ["screenshot"] });
  const marker8 = await files(A, "_upload");
  ok("(8) 같은 URL 재발행 = upsert + 교체 표식",
    a8.body.projectId === A && a8.body.upserted === true && marker8.includes("replace.marker"),
    `${JSON.stringify(a8.body).slice(0, 100)} ${JSON.stringify(marker8)}`);
  if (a8.body.uploads?.screenshot) {
    await fetch(a8.body.uploads.screenshot, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new TextEncoder().encode("not an image"),
    });
  }
  const f8 = await post("/api/ingest/finalize", { projectId: A });
  const rowA8 = await rowOf(A);
  const upload8 = await files(A, "_upload");
  ok("(8) 불량 스크린샷 finalize 400 · 기존 초안 유지 · _upload 정리",
    f8.status === 400 && !!rowA8 && upload8.length === 0,
    `${f8.status} ${f8.body.code} row=${!!rowA8} upload=${JSON.stringify(upload8)}`);

  // (9) 새 URL 행 + 불량 영상 → 이번 발행이 만든 행은 여전히 지운다(고아 정리).
  const n9 = await post("/api/ingest", {
    title: "__probe_did_N9__", targetDevice: "desktop", description: GATE.description, deployUrl: U("d"), uploads: ["video"],
  });
  if (n9.body.uploads?.video) {
    await fetch(n9.body.uploads.video, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new TextEncoder().encode("not a video"),
    });
  }
  const f9 = await post("/api/ingest/finalize", { projectId: n9.body.projectId });
  const row9 = n9.body.projectId ? await rowOf(n9.body.projectId) : "no-row";
  ok("(9) 새 행 + 불량 영상 → finalize 400 · 행 삭제", f9.status === 400 && row9 === null,
    `${f9.status} ${f9.body.code} row=${JSON.stringify(row9)}`);
} finally {
  await cleanupAll();
  console.log("  (throwaway 행·스토리지·토큰·픽스처 정리 완료)");
}

console.log(failed === 0 ? "\n✅ E2E 전부 통과" : `\n❌ ${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
