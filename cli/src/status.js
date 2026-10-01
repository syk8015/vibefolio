import { api, conn } from "./api.js";

// 촬영 상태 — "영상 다 찍혔어?"를 AI가 직접 묻는다(2026-10-02).
//
// 촬영은 주인이 [공개하기]를 누른 다음에야 시작되는데 drafts는 초안만 보여 줘서, 공개된
// 순간 작품이 AI 눈에서 사라졌다. 이 명령은 공개된 작품까지 보여 준다(읽기 전용).
// 문장(summary·message·next)은 서버가 만들어 싣는다 — 원격 MCP와 같은 말을 하게.

export function getStatus(id, { token, origin } = {}) {
  return api("GET", `/api/ingest/status${id ? `?id=${encodeURIComponent(id)}` : ""}`, { token, origin });
}

/** 응답 → 출력 줄. 한 작품이면 할 일까지, 목록이면 끝나지 않은 작품만 설명을 덧붙인다. */
export function formatStatus(body) {
  const one = body.work;
  const works = one ? [one] : body.works ?? [];
  if (!works.length) return ["No works yet. Upload one with `npx nookframe publish`."];
  const lines = [];
  for (const w of works) {
    const f = w.filming ?? {};
    lines.push(w.summary);
    if (one || (f.state !== "done" && f.state !== "no-auto-demo")) {
      lines.push(`    ${f.message} ${f.next}`);
      if (f.failure?.detail) lines.push(`    failure detail: ${f.failure.detail}`);
      if (f.pendingScript) lines.push(`    ${f.pendingScript.message}`);
    }
    if (one) {
      if (w.publicUrl) lines.push(`    work page: ${w.publicUrl}`);
      if (w.reviewUrl) lines.push(`    review: ${w.reviewUrl}`);
    }
  }
  if (!one) lines.push("", `${works.length} work(s). Details for one: nookframe status <id>`);
  return lines;
}

// `nookframe status [id]` CLI 명령.
export async function statusCommand(args) {
  const body = await getStatus(args._[0] || null, conn(args));
  for (const line of formatStatus(body)) console.log(line);
}
