// 매일 밈 밤 작업 — 재료 모으기(2026-11-05, 조사 A·B·G). AI가 아니라 정해진 출처만 정해진 방식으로.
// 한 출처에 한 번만, 정직한 이름(UA)으로. 403·429면 다시 두드리지 않고 실패로 적는다.
// 한국 출처(이슈링크 등)는 영어가 자리 잡은 뒤 켠다 — 이슈링크 제목은 세기만 하고 저장·노출 안 함(조사 G).
import { join } from "node:path";
import { BASE, ensureDir, extractLinks, htmlToText, log, politeFetch, writeJson } from "./util.mjs";

const TEXT_CAP = 40_000; // 출처당 AI에게 넘길 글 상한(글자)
const DAY = 86400_000;

const html = (id, url, { pathPattern } = {}) => ({
  id, url, lang: "en",
  async run() {
    const r = await politeFetch(url);
    if (!r.ok) return { status: r.status, error: r.error };
    return {
      status: r.status,
      links: extractLinks(r.body, url, { pathPattern }),
      text: htmlToText(r.body).slice(0, TEXT_CAP),
    };
  },
});

const json = (id, url, pick) => ({
  id, url, lang: "en",
  async run() {
    const r = await politeFetch(url, { accept: "application/json" });
    if (!r.ok) return { status: r.status, error: r.error };
    try { return { status: r.status, items: pick(JSON.parse(r.body)) }; }
    catch (e) { return { status: r.status, error: `parse: ${e.message}` }; }
  },
});

const since = (days) => Math.floor((Date.now() - days * DAY) / 1000);
const hnQuery = (q) =>
  `https://hn.algolia.com/api/v1/search?${new URLSearchParams({
    query: q, tags: "story", hitsPerPage: "30", numericFilters: `created_at_i>${since(3)},points>10`,
  })}`;
const hnPick = (d) => (d.hits ?? []).map((h) => ({ title: h.title, url: `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points, comments: h.num_comments, at: h.created_at }));
const bsky = (q) =>
  `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${new URLSearchParams({
    q, limit: "40", sort: "top", since: new Date(Date.now() - 2 * DAY).toISOString(),
  })}`;
const bskyPick = (d) => (d.posts ?? []).map((p) => ({
  text: (p.record?.text ?? "").slice(0, 500), likes: p.likeCount, reposts: p.repostCount, at: p.record?.createdAt,
}));

export const SOURCES = [
  // 밈 틀(무엇이 유행하나)
  html("kym-trending", "https://knowyourmeme.com/newsfeed/trending", { pathPattern: /^\/(memes|editorials|news)\// }),
  html("programmerhumor", "https://programmerhumor.io/"),
  // 사람들이 반응하는 사건·말(개발·AI 쪽)
  html("digg", "https://digg.com/"),
  html("garbageday", "https://www.garbageday.email/"),
  json("hn-front", "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30", hnPick),
  json("hn-ai", hnQuery("AI"), hnPick),          // Algolia는 OR 문법이 없다 — 넓게 "AI" + 점수로 거름
  json("hn-claude", hnQuery("Claude"), hnPick),
  json("bsky-vibe", bsky("vibe coding"), bskyPick),
  json("bsky-claude", bsky("claude code"), bskyPick),
  json("bsky-aicoding", bsky("AI coding"), bskyPick),
  // 밈 그림 틀 순위 — 매일 저장해 두면 순위 변화가 유행 근거가 된다
  json("imgflip", "https://api.imgflip.com/get_memes", (d) => (d.data?.memes ?? []).map((m, i) => ({ rank: i + 1, id: m.id, name: m.name }))),
];

export async function gather(date, { only } = {}) {
  const dir = ensureDir(join(BASE, "raw", date));
  const manifest = [];
  for (const src of SOURCES) {
    if (only && !only.includes(src.id)) continue;
    const started = Date.now();
    let res;
    try { res = await src.run(); } catch (e) { res = { status: 0, error: String(e?.message ?? e) }; }
    const entry = {
      id: src.id, url: src.url, lang: src.lang, status: res.status, error: res.error ?? null,
      linkCount: res.links?.length ?? 0, itemCount: res.items?.length ?? 0, textChars: res.text?.length ?? 0,
      ms: Date.now() - started,
    };
    manifest.push(entry);
    writeJson(join(dir, `${src.id}.json`), { ...entry, fetchedAt: new Date().toISOString(), ...res });
    log(`${entry.status === 200 ? "✓" : "✗"} ${src.id} ${entry.status} links=${entry.linkCount} items=${entry.itemCount} text=${entry.textChars}`);
  }
  writeJson(join(dir, "manifest.json"), { date, at: new Date().toISOString(), sources: manifest });
  return manifest;
}
