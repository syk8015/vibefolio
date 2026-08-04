// API 비용 실측 (2026-08-04) — explore/moderate가 버리던 응답 usage를 집계해
// 실행(테이크)마다 실제 토큰·달러를 로그와 Script.notes에 남긴다. 이전까지 편당
// 비용은 추정치(~$0.13)뿐이었고 로컬에 실측 데이터가 전혀 없었다.
//
// 가격은 Anthropic 1P 기준 USD/MTok. 캐시는 5분 TTL만 쓰므로(write 1.25×,
// read 0.1×) 그 배수를 하드코딩한다. 모델 가격이 바뀌면 여기 한 곳만 고친다.

export type ApiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-5": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

// Sonnet 5는 2026-08-31까지 인트로가($2/$10), 이후 정가($3/$15) — 날짜로 자동 전환.
const SONNET5_INTRO_UNTIL = Date.parse("2026-09-01T00:00:00Z");
function priceFor(model: string): { in: number; out: number } | null {
  if (model.startsWith("claude-sonnet-5")) {
    return Date.now() < SONNET5_INTRO_UNTIL ? { in: 2, out: 10 } : { in: 3, out: 15 };
  }
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  return key ? PRICES[key] : null;
}

export function emptyUsage(): Required<ApiUsage> {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}

export function addUsage(sum: Required<ApiUsage>, u: ApiUsage | undefined): void {
  if (!u) return;
  sum.input_tokens += u.input_tokens ?? 0;
  sum.output_tokens += u.output_tokens ?? 0;
  sum.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  sum.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
}

// DEMO_CU_MODEL 등 env 오버라이드가 날짜 suffix 붙은 ID일 수 있어 prefix 매칭.
export function costUsd(model: string, u: ApiUsage): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (
    ((u.input_tokens ?? 0) * p.in +
      (u.cache_creation_input_tokens ?? 0) * p.in * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.in * 0.1 +
      (u.output_tokens ?? 0) * p.out) /
    1e6
  );
}

export function costLine(model: string, u: ApiUsage, calls: number): string {
  const d = costUsd(model, u);
  const dollars = d == null ? "?$ (가격표에 없는 모델)" : `$${d.toFixed(4)}`;
  return (
    `${model} ${calls}콜 — in ${u.input_tokens ?? 0} / cacheW ${u.cache_creation_input_tokens ?? 0}` +
    ` / cacheR ${u.cache_read_input_tokens ?? 0} / out ${u.output_tokens ?? 0} ≈ ${dollars}`
  );
}
