// 매일 밈 5단계의 순수 부분(2026-11-05) — 공개한 줄을 홈이 쓰는 모양으로 바꾸고, 최신화를 고정 문구에 덮어쓴다.
// 네트워크·Next 없음: 홈 화면 부품(클라이언트)·서버(lib/memeLive.ts)·프로브(scripts/probe-meme-live-unit.mts)가 같이 쓴다.
import type { LoggedInTagline } from "@/lib/loggedInTaglines";

const FRESH_MS = 24 * 3_600_000;

export type LiveMeme = { text: string; reply?: string };
export type LiveMemes = {
  /** 로그인 홈 맨 앞(공개한 지 하루 안) */
  fresh: LiveMeme[];
  /** 나머지 공개 줄(고정 문구와 섞는다) */
  rest: LiveMeme[];
  /** 로그아웃 홈에도 띄울 줄(audience=everyone) — fresh가 앞 */
  everyone: LiveMeme[];
  /** 최신화: 기존 문구 → 새 문구 */
  overrides: Record<string, LiveMeme>;
};
export const EMPTY_LIVE: LiveMemes = { fresh: [], rest: [], everyone: [], overrides: {} };

const toLine = (r: { text: string; reply: string | null }): LiveMeme => (r.reply ? { text: r.text, reply: r.reply } : { text: r.text });

/** 공개 줄 목록을 홈이 쓰는 모양으로. */
export function shapeLiveMemes(
  rows: { text: string; reply: string | null; audience: string; kind: string; replaces: string | null; reviewed_at: string | null }[],
  nowMs: number,
): LiveMemes {
  const out: LiveMemes = { fresh: [], rest: [], everyone: [], overrides: {} };
  const everyoneFresh: LiveMeme[] = [];
  const everyoneRest: LiveMeme[] = [];
  // 오래된 것부터 — 같은 문구를 두 번 최신화했으면 나중 것이 이긴다.
  const sorted = [...rows].sort((a, b) => (a.reviewed_at ?? "").localeCompare(b.reviewed_at ?? ""));
  for (const r of sorted) {
    const line = toLine(r);
    if (r.kind === "refresh") {
      if (r.replaces) out.overrides[r.replaces] = line;
      continue;
    }
    const fresh = !!r.reviewed_at && nowMs - Date.parse(r.reviewed_at) < FRESH_MS;
    (fresh ? out.fresh : out.rest).push(line);
    if (r.audience === "everyone") (fresh ? everyoneFresh : everyoneRest).push(line);
  }
  out.everyone = [...everyoneFresh, ...everyoneRest];
  return out;
}

/** 고정 문구에 최신화 덮어쓰기. */
export function applyOverrides(pool: LoggedInTagline[], overrides: Record<string, LiveMeme>): LoggedInTagline[] {
  return pool.map((l) => overrides[l.text] ?? l);
}

/** 문자열 풀(로그아웃 홈)에 최신화 덮어쓰기 — 바뀐 줄은 답글을 가질 수 있다. */
export function applyOverridesToStrings(pool: string[], overrides: Record<string, LiveMeme>): LiveMeme[] {
  return pool.map((t) => overrides[t] ?? { text: t });
}
