// CLI JSON 입력 프로브(2026-09-15) — publish `--file`·표준입력(`--json -`)·`--json`, `schema` 명령.
// 127.0.0.1에 가짜 API 서버를 띄우고 cli/bin/nookframe.js를 NOOKFRAME_ORIGIN으로 그쪽에 붙여,
// 서버에 실제로 도착한 본문을 원본과 비교한다. 네트워크·비밀값·쿼터 없음 → npm test에 들어간다.
//
// 사용: 레포 루트에서 `node scripts/probe-cli-input.mjs`.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const CLI = "cli/bin/nookframe.js";
let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${!pass && detail ? ` — ${String(detail).slice(0, 300)}` : ""}`);
  if (!pass) failed++;
};

// 가짜 API — 받은 요청을 기록하고, CLI가 다음 단계로 가는 데 필요한 최소 응답만 준다.
const seen = [];
const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const isJson = (req.headers["content-type"] ?? "").includes("application/json");
    const body = isJson && raw.length ? JSON.parse(raw.toString("utf8")) : null;
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body, raw });
    const send = (obj) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const reviewUrl = `${origin}/dashboard?review=p-1`;
    if (req.method === "POST" && req.url === "/api/ingest") {
      const uploads = Array.isArray(body?.uploads)
        ? Object.fromEntries(body.uploads.map((k) => [k, `${origin}/put/${k}`]))
        : null;
      return send({
        ok: true, projectId: "p-1", reviewUrl, accepted: { title: body?.title },
        ...(body?.draftId ? { upserted: true } : {}),
        ...(uploads ? { uploads, finalizeUrl: `${origin}/api/ingest/finalize` } : {}),
      });
    }
    if (req.method === "PUT" && req.url.startsWith("/put/")) {
      res.writeHead(200);
      return res.end();
    }
    if (req.method === "POST" && req.url === "/api/ingest/finalize") return send({ ok: true, projectId: "p-1", reviewUrl });
    if (req.method === "POST" && req.url.startsWith("/api/ingest/rerecord/")) {
      return send({ ok: true, accepted: { demoScriptSteps: body?.demoScript?.steps?.length ?? 0 } });
    }
    if (req.method === "PATCH" && req.url.startsWith("/api/ingest/drafts/")) {
      return send({ ok: true, reviewUrl, accepted: { title: body?.title } });
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end("{}");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// 셸을 거치지 않고 실행한다(spawn 인자 배열) — 셸 인용 문제와 CLI 파싱을 섞지 않으려고.
function run(args, { input } = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, NOOKFRAME_TOKEN: "nf_probe_dummy", NOOKFRAME_ORIGIN: ORIGIN },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => done({ code, out, err }));
    child.stdin.end(input ?? "");
  });
}

const tmp = mkdtempSync(join(tmpdir(), "nf-cli-input-"));
const lastIngest = () => [...seen].reverse().find((s) => s.method === "POST" && s.url === "/api/ingest");
const reset = () => {
  seen.length = 0;
};

// 명령줄 인자에서 깨지던 값들: 작은따옴표·큰따옴표·줄바꿈·한글·이모지.
const PAYLOAD = {
  title: "스킨로그 — Kim's \"skin\" diary",
  description: "피부 기록을 매일 남기고\nit's the diary you'd actually keep\n사진으로 보는 변화 ✨",
  deployUrl: "https://example.com/app",
  targetDevice: "mobile",
  demoAccess: { noLogin: true, note: "no auth guard — checked middleware" },
  demoScript: { steps: [{ goal: "기록 추가", selector: "#add", action: "click", expect: "폼이 열린다" }] },
};

try {
  // (1) --file
  const f1 = join(tmp, "payload.json");
  writeFileSync(f1, JSON.stringify(PAYLOAD, null, 2));
  reset();
  let r = await run(["publish", "--file", f1]);
  ok("(1) publish --file: 서버에 도착한 본문 = 파일", r.code === 0 && isDeepStrictEqual(lastIngest()?.body, PAYLOAD), r.err || JSON.stringify(lastIngest()?.body));
  ok("(1) 토큰은 Bearer 헤더로만", lastIngest()?.auth === "Bearer nf_probe_dummy");

  // (2) --json - (표준입력)
  reset();
  r = await run(["publish", "--json", "-"], { input: JSON.stringify(PAYLOAD) });
  ok("(2) publish --json -: 표준입력 본문이 같다", r.code === 0 && isDeepStrictEqual(lastIngest()?.body, PAYLOAD), r.err);

  // (3) --json 인라인 — 예전 방식 유지
  reset();
  r = await run(["publish", "--json", JSON.stringify(PAYLOAD)]);
  ok("(3) publish --json '<json>': 예전 방식 그대로", r.code === 0 && isDeepStrictEqual(lastIngest()?.body, PAYLOAD), r.err);

  // (4) BOM 붙은 파일
  const f4 = join(tmp, "bom.json");
  writeFileSync(f4, `﻿${JSON.stringify(PAYLOAD)}`);
  reset();
  r = await run(["publish", "--file", f4]);
  ok("(4) BOM 붙은 파일도 읽는다", r.code === 0 && isDeepStrictEqual(lastIngest()?.body, PAYLOAD), r.err);

  // (5) 플래그가 JSON을 덮는다
  reset();
  r = await run(["publish", "--file", f1, "--title", "Flag Title"]);
  ok("(5) --title 플래그가 JSON의 title을 이긴다", r.code === 0 && lastIngest()?.body?.title === "Flag Title", r.err);

  // (6) { payload: {...} } 봉투(서버가 받는 모양)
  const f6 = join(tmp, "wrapped.json");
  writeFileSync(f6, JSON.stringify({ payload: PAYLOAD }));
  reset();
  r = await run(["publish", "--file", f6]);
  ok("(6) { payload } 봉투를 풀어서 보낸다", r.code === 0 && isDeepStrictEqual(lastIngest()?.body, PAYLOAD), r.err);

  // (7) JSON의 dir(MCP 스키마 필드) → bundle 2단계, dir 키는 서버로 안 간다
  const site = join(tmp, "site");
  mkdirSync(site);
  writeFileSync(join(site, "index.html"), "<!doctype html><h1>hi</h1>");
  const noUrl = { ...PAYLOAD };
  delete noUrl.deployUrl;
  const f7 = join(tmp, "dir.json");
  writeFileSync(f7, JSON.stringify({ ...noUrl, dir: site }));
  reset();
  r = await run(["publish", "--file", f7]);
  const b7 = lastIngest()?.body;
  const put = seen.find((s) => s.method === "PUT" && s.url === "/put/bundle");
  ok("(7) JSON dir → zip 2단계(dir 키 미전송·PK zip PUT·finalize)",
    r.code === 0 && isDeepStrictEqual(b7?.uploads, ["bundle"]) && !("dir" in (b7 ?? {})) &&
      put?.raw.subarray(0, 2).toString() === "PK" && seen.some((s) => s.url === "/api/ingest/finalize"),
    r.err || JSON.stringify(b7));

  // (8) 거절 — 서버에 아무것도 보내기 전에 멈춘다
  const reject = async (name, args, pattern, opts) => {
    reset();
    const rr = await run(args, opts);
    ok(name, rr.code === 1 && pattern.test(rr.err) && seen.length === 0, `${rr.code} ${rr.err.trim()}`);
  };
  const badJson = join(tmp, "bad.json");
  writeFileSync(badJson, '{ "title": "x", }');
  const arr = join(tmp, "arr.json");
  writeFileSync(arr, "[1, 2]");
  await reject("(8a) --file과 --json을 같이 주면 거절", ["publish", "--file", f1, "--json", "{}"], /not both/);
  await reject("(8b) 없는 파일 → 경로를 말한다", ["publish", "--file", join(tmp, "nope.json")], /JSON file not found/);
  await reject("(8c) 깨진 JSON → 파서가 짚은 위치를 싣는다", ["publish", "--file", badJson], /Could not parse .* as JSON: .*position/);
  await reject("(8d) 배열 → 객체여야 한다", ["publish", "--file", arr], /must be a JSON object/);
  await reject("(8e) --json 뒤에 값이 없음", ["publish", "--json"], /--json needs a value/);
  await reject("(8f) 빈 표준입력", ["publish", "--json", "-"], /standard input is empty/, { input: "" });
  await reject("(8g) --dir 뒤에 경로가 없음", ["publish", "--file", f1, "--dir"], /--dir needs a path/);
  await reject("(8h) --id 뒤에 값이 없음", ["publish", "--file", f1, "--id"], /--id needs a draft id/);

  // (11) --id → payload.draftId, 결과에 초안 id와 다음 수정 방법
  reset();
  r = await run(["publish", "--file", f1, "--id", "d-42"]);
  ok("(11) publish --id: draftId로 보내고, 초안 id와 다음 수정 방법을 알려준다",
    r.code === 0 && lastIngest()?.body?.draftId === "d-42" && /Updated draft p-1/.test(r.out) && /publish --id p-1/.test(r.out),
    r.err || r.out);

  // (9) rerecord · drafts update도 같은 규칙
  reset();
  r = await run(["rerecord", "p-9", "--json", "-", "--note", "왜 바꿨는지"], { input: JSON.stringify({ steps: PAYLOAD.demoScript.steps }) });
  const rer = seen.find((s) => s.url === "/api/ingest/rerecord/p-9");
  ok("(9a) rerecord --json -: 대본을 봉투로 감싸 보낸다",
    r.code === 0 && isDeepStrictEqual(rer?.body, { demoScript: { steps: PAYLOAD.demoScript.steps }, note: "왜 바꿨는지" }), r.err);
  const f9 = join(tmp, "patch.json");
  writeFileSync(f9, JSON.stringify({ description: PAYLOAD.description }));
  reset();
  r = await run(["drafts", "update", "p-9", "--file", f9]);
  const patch = seen.find((s) => s.method === "PATCH");
  ok("(9b) drafts update --file", r.code === 0 && patch?.body?.description === PAYLOAD.description, r.err);

  // (10) schema — stdout은 순수 JSON, MCP 입력 스키마와 같은 출처
  reset();
  r = await run(["schema"]);
  let doc = null;
  try {
    doc = JSON.parse(r.out);
  } catch {
    doc = null;
  }
  const { PUBLISH_INPUT_SCHEMA, PUBLISH_DESCRIPTION } = await import("../cli/src/schema.js");
  ok("(10) schema: 순수 JSON · $schema · MCP 입력 스키마와 같은 필드·규칙",
    r.code === 0 && !!doc?.$schema?.includes("json-schema.org") &&
      isDeepStrictEqual(doc.properties, PUBLISH_INPUT_SCHEMA.properties) &&
      isDeepStrictEqual(doc.required, PUBLISH_INPUT_SCHEMA.required) &&
      doc.description === PUBLISH_DESCRIPTION && seen.length === 0,
    r.err || r.out.slice(0, 200));
} finally {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n❌ ${failed}건 실패` : "\n✅ CLI 입력 프로브 전부 통과");
process.exit(failed ? 1 : 0);
