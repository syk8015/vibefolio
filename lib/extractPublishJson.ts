// /publish 붙여넣기에서 JSON 골라내기 (2026-09-04, 인터뷰 ⑦).
//
// 셸 없는 챗봇은 JSON을 "출력"만 할 수 있고, 사람은 그걸 복사해 온다. 그런데 AI 답은
// 순수 JSON이 아니다 — ```json 펜스가 붙고, 앞뒤로 "여기 있어요" 같은 설명이 붙고,
// 가끔 링크까지 딸려 온다. 전엔 그걸 그대로 JSON.parse 해서 "읽을 수 없어요"로
// 튕겼고, 사람이 손으로 펜스를 지워야 했다. 여기서는 답을 통째로 받아 첫 번째
// 균형 잡힌 { … } 객체를 꺼낸다 — 문자열 안의 중괄호는 세지 않는다.

export type ExtractResult =
  | { ok: true; payload: Record<string, unknown>; json: string }
  | { ok: false; reason: "empty" | "no-object" | "invalid" | "url-only" };

export function extractPublishJson(raw: string): ExtractResult {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (/^https?:\/\/\S+$/i.test(text)) return { ok: false, reason: "url-only" };

  // 1) 통째로 JSON이면 그대로.
  const direct = tryParse(text);
  if (direct) return { ok: true, payload: direct, json: text };

  // 2) 펜스 안쪽 우선 — AI는 거의 항상 ```json … ``` 으로 감싼다.
  const fence = text.match(/```(?:json|jsonc|javascript|js)?\s*\n?([\s\S]*?)```/i);
  if (fence) {
    const inner = fence[1].trim();
    const parsed = tryParse(inner) ?? tryParse(firstObject(inner) ?? "");
    if (parsed) return { ok: true, payload: parsed, json: inner };
  }

  // 3) 본문 어딘가의 첫 { … } 객체.
  const slice = firstObject(text);
  if (!slice) return { ok: false, reason: "no-object" };
  const parsed = tryParse(slice);
  return parsed ? { ok: true, payload: parsed, json: slice } : { ok: false, reason: "invalid" };
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// 첫 '{'부터 짝이 맞는 '}'까지. 문자열 리터럴 안의 괄호·이스케이프는 건너뛴다.
function firstObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
