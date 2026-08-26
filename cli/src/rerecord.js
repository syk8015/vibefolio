import { readFileSync } from "node:fs";
import { api, conn } from "./api.js";

// 재촬영 — 다시 쓴 촬영 대본 제출 (2026-08-26).
//
// 루프의 절반은 이미 사이트에 있다: 주인이 영상을 보고 **말로** 불만을 적으면,
// 사이트가 원본 대본·작품 정보·토큰을 통째로 담은 프롬프트를 만들어 준다. 그
// 프롬프트를 받은 AI가 여기로 새 대본을 낸다.
//
// 제출해도 공개 데이터는 안 바뀐다 — pending_demo_script에 대기하고, 주인이
// 대시보드에서 확인하고 [재촬영]을 눌러야 승격된다. AI에게 그 사실을 반드시
// 말해줘야 "제출했으니 끝"이라고 사람에게 잘못 보고하지 않는다.

export function submitRerecord(id, body, { token, origin } = {}) {
  return api("POST", `/api/ingest/rerecord/${encodeURIComponent(id)}`, { token, origin, body });
}

// 사람이 준 JSON이 { demoScript, note } 봉투일 수도, 대본 자체 { steps: [...] }일
// 수도 있다. 둘 다 받는다 — 프롬프트가 대본만 뽑아 주는 경우가 실제로 흔하다.
export function toRerecordBody(parsed, note) {
  const body = parsed && Array.isArray(parsed.steps) ? { demoScript: parsed } : { ...parsed };
  if (note) body.note = note;
  if (!body.demoScript || !Array.isArray(body.demoScript.steps)) {
    throw new Error(
      '대본을 찾지 못했어요 — { "steps": [...] } 또는 { "demoScript": { "steps": [...] } } 형태여야 해요.',
    );
  }
  return body;
}

/** `nookframe rerecord <id> --json '<json>' | --file <path> [--note "..."]` */
export async function rerecordCommand(args) {
  const id = args._[0] || (typeof args.id === "string" ? args.id : null);
  if (!id) {
    throw new Error(
      "사용법: nookframe rerecord <프로젝트 id> --json '<대본 JSON>'  (id는 재촬영 프롬프트에 적혀 있어요)",
    );
  }

  let raw = null;
  if (typeof args.file === "string") raw = readFileSync(args.file, "utf8");
  else if (typeof args.json === "string") raw = args.json;
  if (!raw) throw new Error("대본을 주세요 — --json '<JSON>' 또는 --file <경로>.");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${args.file ? "--file" : "--json"} 값을 JSON으로 읽을 수 없어요.`);
  }

  const body = toRerecordBody(parsed, typeof args.note === "string" ? args.note : null);
  const res = await submitRerecord(id, body, conn(args));
  for (const line of formatRerecord(res)) console.log(line);
}

/** 제출 결과를 사람·AI 둘 다 읽을 수 있게. 조용한 폐기(스텝 드랍)는 경고로. */
export function formatRerecord(res) {
  const a = res?.accepted ?? {};
  const lines = [`✓ 새 대본을 제출했어요 — ${a.demoScriptSteps ?? 0}스텝 대기 중.`];
  if (a.note) lines.push(`    바꾼 이유: ${a.note}`);
  if (a.demoScriptDropped) {
    lines.push(
      "  ⚠ 일부 스텝이 형식에 안 맞아 버려졌어요 — goal은 필수이고, action은 click·type·drag·scroll·hover·draw·focus 중 하나예요.",
    );
  }
  if (res?.next) lines.push(`\n  ${res.next}`);
  return lines;
}
