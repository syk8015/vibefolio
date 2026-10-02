// 요청 본문 상한(2026-10-02, 위협 목록 F4). 네트워크 없음.
// 지키는 것: content-length 머리표가 없거나 거짓이어도(조각 전송) 실제로 읽은 바이트로 끊는다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BodyTooLargeError, readBodyCapped, readJsonCapped, readFormCapped,
  readJsonOr, readTextOr, BODY_TOO_LARGE,
} from "../lib/upload-safety";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 머리표 없이 조각으로 흘려보내는 본문(chunked와 같은 모양).
function chunkedRequest(chunks: Uint8Array[], headers: Record<string, string> = {}): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
  return new Request("https://x.test/api", {
    method: "POST", body: stream, headers, duplex: "half",
  } as RequestInit);
}
const bytes = (n: number) => new Uint8Array(n).fill(65);

async function rejects(name: string, p: Promise<unknown>) {
  try {
    await p;
    ok(name, false, "통과해 버림");
  } catch (e) {
    ok(name, e instanceof BodyTooLargeError, String(e));
  }
}

// 1. 머리표 없는 조각 전송 — 상한을 넘으면 끊는다(이게 이번 구멍).
await rejects("머리표 없는 조각 전송 11바이트 > 상한 10", readBodyCapped(chunkedRequest([bytes(6), bytes(5)]), 10));
// 2. 머리표가 거짓으로 작게 적혀 있어도 실제 바이트로 끊는다.
await rejects("거짓 머리표(5)인데 실제 20바이트", readBodyCapped(chunkedRequest([bytes(20)], { "content-length": "5" }), 10));
// 3. 머리표가 이미 크면 읽기 전에 거절.
await rejects("머리표 1000 > 상한 10", readBodyCapped(new Request("https://x.test", { method: "POST", body: "a", headers: { "content-length": "1000" } }), 10));
// 4. 딱 상한까지는 통과.
{
  const got = await readBodyCapped(chunkedRequest([bytes(4), bytes(6)]), 10);
  ok("정확히 상한 10바이트는 통과", got.length === 10, String(got.length));
}
// 5. JSON — 정상·깨짐·초과.
{
  const v = await readJsonCapped(new Request("https://x.test", { method: "POST", body: '{"code":"nf_code_x"}' }), 100);
  ok("JSON 정상 파싱", (v as { code?: string }).code === "nf_code_x");
  try {
    await readJsonCapped(new Request("https://x.test", { method: "POST", body: "{bad" }), 100);
    ok("깨진 JSON → SyntaxError", false);
  } catch (e) {
    ok("깨진 JSON → SyntaxError(상한 오류와 구분)", e instanceof SyntaxError && !(e instanceof BodyTooLargeError));
  }
  const big = new TextEncoder().encode(JSON.stringify({ x: "a".repeat(200) }));
  await rejects("JSON 조각 전송 초과", readJsonCapped(chunkedRequest([big]), 100));
}
// 6. multipart — 다시 감싸도 칸·파일이 그대로 나온다.
{
  const fd = new FormData();
  fd.set("payload", '{"title":"t"}');
  fd.set("bundle", new File([bytes(30)], "a.zip"));
  const src = new Request("https://x.test", { method: "POST", body: fd });
  const form = await readFormCapped(src, 10_000);
  const file = form.get("bundle");
  ok("multipart payload 칸 유지", form.get("payload") === '{"title":"t"}');
  ok("multipart 파일 크기 유지", file instanceof File && file.size === 30, file instanceof File ? String(file.size) : "파일 아님");
  const fd2 = new FormData();
  fd2.set("bundle", new File([bytes(500)], "a.zip"));
  const big = new Uint8Array(await new Request("https://x.test", { method: "POST", body: fd2 }).arrayBuffer());
  const ct = new Request("https://x.test", { method: "POST", body: fd2 }).headers.get("content-type") ?? "";
  await rejects("multipart 조각 전송 초과", readFormCapped(chunkedRequest([big], { "content-type": ct }), 100));
}

// 7. 나머지 라우트용(F55) — 깨졌거나 빈 본문은 fallback, 넘치면 BODY_TOO_LARGE(삼키지 않는다).
{
  const v = await readJsonOr(new Request("https://x.test", { method: "POST", body: '{"op":"claim"}' }), 100, {});
  ok("readJsonOr 정상 파싱", v?.op === "claim");
  ok("readJsonOr 깨진 JSON → fallback", (await readJsonOr(new Request("https://x.test", { method: "POST", body: "{bad" }), 100, null)) === null);
  const empty = await readJsonOr(new Request("https://x.test", { method: "POST" }), 100, {});
  ok("readJsonOr 빈 본문 → fallback", typeof empty === "object" && empty !== null && Object.keys(empty).length === 0);
  ok("readJsonOr 조각 전송 초과 → BODY_TOO_LARGE",
    (await readJsonOr(chunkedRequest([bytes(60), bytes(60)]), 100, null)) === BODY_TOO_LARGE);
  ok("readTextOr 정상", (await readTextOr(new Request("https://x.test", { method: "POST", body: "a=1&b=2" }), 100)) === "a=1&b=2");
  ok("readTextOr 조각 전송 초과 → BODY_TOO_LARGE",
    (await readTextOr(chunkedRequest([bytes(101)]), 100)) === BODY_TOO_LARGE);
}

// 8. 앞으로 생길 라우트도 상한 없이 본문을 통째로 읽지 못하게 — app/api 아래 raw 읽기 금지.
{
  const RAW = /\b(?:req|request)\.(?:json|text|formData|arrayBuffer|blob)\(\)/;
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) {
        readFileSync(full, "utf8").split("\n").forEach((line, i) => {
          if (RAW.test(line)) hits.push(`${full}:${i + 1}`);
        });
      }
    }
  };
  walk(join(import.meta.dirname, "..", "app", "api"));
  ok("app/api에 상한 없는 본문 읽기 없음(readJsonOr·readJsonCapped·readTextOr를 쓸 것)", hits.length === 0, hits.join(", "));
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
