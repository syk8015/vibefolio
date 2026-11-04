// 매일 밈 밤 작업 — 유행 숫자 재기(2026-11-05, 설계 C-trend-check.md).
// AI의 느낌이 아니라 날짜가 찍힌 숫자: 출처마다 '지난 7일' 대 '그 전 30일'을 하루 평균으로 비교한다.
//   성장 g = log2((최근 하루 평균 + k) / (기준 하루 평균 + k)), k = 작은 수 다듬기
//   점수 = 50 + 15 × (g 평균) + 20 × (오르는 출처 비율 − 0.5), 0~100
//   판정: 근거 출처(최소 건수 넘음) 2곳 미만 → insufficient · 모두 0 → dead ·
//         배율 ≥1.5 이고 절반 이상이 오름 → rising · ≤0.7 → fading · 그 사이 → alive
import { politeFetch } from "./util.mjs";

const DAY = 86400_000;
export const RECENT_DAYS = 7;
export const BASE_DAYS = 30;
export const MIN_COUNT = 3;         // 이 출처를 근거로 치려면 두 기간 합이 이만큼은
const K = 0.5 / RECENT_DAYS;        // 하루 평균 다듬기

export function growth(recent, base) {
  return Math.log2((recent / RECENT_DAYS + K) / (base / BASE_DAYS + K));
}

/** @param {{name:string, recent:number, base:number, capped?:boolean}[]} sources */
export function scoreTrend(sources) {
  const usable = sources.filter((s) => s.recent + s.base >= MIN_COUNT);
  const total = sources.reduce((n, s) => n + s.recent + s.base, 0);
  if (total === 0) return { score: 0, verdict: "dead", ratio: null, usable: 0, sources };
  if (usable.length < 2) return { score: null, verdict: "insufficient", ratio: null, usable: usable.length, sources };
  const gs = usable.map((s) => growth(s.recent, s.base));
  const avg = gs.reduce((a, b) => a + b, 0) / gs.length;
  const agree = gs.filter((g) => g > 0).length / gs.length;
  const score = Math.max(0, Math.min(100, Math.round(50 + 15 * avg + 20 * (agree - 0.5))));
  const ratio = Math.round(2 ** avg * 100) / 100;
  const verdict = ratio >= 1.5 && agree >= 0.5 ? "rising" : ratio <= 0.7 ? "fading" : "alive";
  return { score, verdict, ratio, usable: usable.length, sources };
}

const sec = (ms) => Math.floor(ms / 1000);

// Hacker News(Algolia): 글·댓글 수, 정확한 건수(nbHits).
async function hnCount(phrase, from, to) {
  const q = new URLSearchParams({
    query: `"${phrase}"`, tags: "(story,comment)", hitsPerPage: "0",
    numericFilters: `created_at_i>${sec(from)},created_at_i<${sec(to)}`,
  });
  const r = await politeFetch(`https://hn.algolia.com/api/v1/search?${q}`);
  if (!r.ok) return null;
  try { return JSON.parse(r.body).nbHits ?? null; } catch { return null; }
}

// Bluesky: 로그인 없이 첫 쪽(최신순 최대 100개)만 준다. 거의 꽉 차면(capped) 건수를 그대로 못 쓰니,
// 가장 오래된 글까지 걸린 시간으로 '하루 몇 개'를 어림해 기간 길이만큼 곱한다.
async function bskyCount(phrase, from, to) {
  const q = new URLSearchParams({
    q: `"${phrase}"`, limit: "100", sort: "latest",
    since: new Date(from).toISOString(), until: new Date(to).toISOString(),
  });
  const r = await politeFetch(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${q}`);
  if (!r.ok) return null;
  try {
    const posts = JSON.parse(r.body).posts ?? [];
    const n = posts.length;
    // 실측(11-05): 한 쪽이 꽉 차도 98~99개로 오는 일이 있어 90개부터 '꽉 참'으로 본다.
    if (n < 90) return { n, capped: false };
    const oldest = Math.min(...posts.map((p) => Date.parse(p.indexedAt ?? p.record?.createdAt)).filter(Number.isFinite));
    const spanDays = Math.max((to - oldest) / DAY, 1 / 24);
    return { n: Math.round((n / spanDays) * ((to - from) / DAY)), capped: true };
  } catch { return null; }
}

// 위키백과 하루 조회수(문서가 있는 밈만 — title을 줄 때만 잰다).
async function wikiViews(title, from, to) {
  const d = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
  const r = await politeFetch(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, "_"))}/daily/${d(from)}/${d(to)}`,
  );
  if (!r.ok) return null;
  try { return JSON.parse(r.body).items.reduce((s, i) => s + (i.views ?? 0), 0); } catch { return null; }
}

/** 문구 하나를 잰다. @returns 판정 + 출처별 숫자(근거로 그대로 저장) */
export async function measurePhrase(phrase, { now = Date.now(), wikiTitle } = {}) {
  const recentFrom = now - RECENT_DAYS * DAY;
  const baseFrom = recentFrom - BASE_DAYS * DAY;
  const sources = [];
  const [hr, hb] = await Promise.all([hnCount(phrase, recentFrom, now), hnCount(phrase, baseFrom, recentFrom)]);
  if (hr !== null && hb !== null) sources.push({ name: "hackernews", recent: hr, base: hb });
  const [br, bb] = await Promise.all([bskyCount(phrase, recentFrom, now), bskyCount(phrase, baseFrom, recentFrom)]);
  if (br && bb) sources.push({ name: "bluesky", recent: br.n, base: bb.n, capped: br.capped || bb.capped });
  if (wikiTitle) {
    const [wr, wb] = await Promise.all([wikiViews(wikiTitle, recentFrom, now), wikiViews(wikiTitle, baseFrom, recentFrom)]);
    // 조회수는 글 수보다 훨씬 커서 그대로 넣으면 g가 같은 축이 아니다 → 하루 평균 비율만 쓰려고 1/100로 줄임.
    if (wr !== null && wb !== null) sources.push({ name: "wikipedia", recent: Math.round(wr / 100), base: Math.round(wb / 100) });
  }
  return { phrase, measuredAt: new Date(now).toISOString(), window: { recentDays: RECENT_DAYS, baseDays: BASE_DAYS }, ...scoreTrend(sources) };
}
