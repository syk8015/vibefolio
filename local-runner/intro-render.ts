// 소개 영상 파일 만들기(2026-10-02, docs/intro-film.md 5단계).
//
// 화면 없는 작품의 장면 대본은 명함(PC)이 그 자리에서 그린다 — 여기서 만드는 mp4는 폰 명함·썸네일·공유용이다.
// 사이트의 렌더 전용 페이지(/intro-render/{id})를 1920×1080으로 열고 window.__introFilm.renderAt(t)로 프레임을
// 하나씩 그려 찍는다(재생기와 같은 코드·같은 글꼴 → 화면과 파일이 같다). 흐림은 페이지가 그린다(빠른 카메라
// 이동마다 같은 방향 흐림) — 서브프레임 겹치기는 3배 느리고 이동이 빠르면 겹쳐 보였다(10-01 온습도계 실측).
// 프레임 구간을 나눠 탭 여러 개로 찍고 ffmpeg로 이어붙인다(HyperFrames·Remotion과 같은 모양).
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { chromium, type Browser } from "playwright-core";
import { apiPost, putSigned, type SignedTarget } from "./api";
import { OUT_DIR, PROMO_APP_URL } from "./config";
import { run } from "./util";

const FPS = 30;
const W = 1920;
const H = 1080;
const POSTER_T = 3.4;

type Job = { id: string; hash: string; locales: ("en" | "ko")[] };
type Sign = { ts: number; video: SignedTarget; poster: SignedTarget };

async function capture(browser: Browser, url: string, dir: string): Promise<number> {
  const probe = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await probe.goto(url, { waitUntil: "load", timeout: 60_000 });
  await probe.waitForFunction(() => !!(window as unknown as { __introFilm?: unknown }).__introFilm, null, { timeout: 60_000 });
  const duration = await probe.evaluate(() => (window as unknown as { __introFilm: { duration: number } }).__introFilm.duration);
  await probe.close();
  const total = Math.ceil(duration * FPS);
  // 탭 수 — 코어 절반(최소 2, 최대 4). 맥 한 대에서 다른 촬영과 겹치지 않게 넉넉히 남긴다.
  const lanes = Math.max(2, Math.min(4, Math.floor(cpus().length / 2)));
  const per = Math.ceil(total / lanes);
  await Promise.all(Array.from({ length: lanes }, async (_, lane) => {
    const from = lane * per, to = Math.min(total, from + per);
    if (from >= to) return;
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => !!(window as unknown as { __introFilm?: unknown }).__introFilm, null, { timeout: 60_000 });
    for (let i = from; i < to; i++) {
      await page.evaluate((t) => (window as unknown as { __introFilm: { renderAt: (t: number) => void } }).__introFilm.renderAt(t), i / FPS);
      await page.screenshot({ path: `${dir}/f${String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    }
    await page.close();
  }));
  return duration;
}

async function renderLocale(browser: Browser, job: Job, locale: "en" | "ko"): Promise<{ video: Buffer; poster: Buffer }> {
  const dir = `${OUT_DIR}/intro/${job.id}-${locale}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const url = `${PROMO_APP_URL}/intro-render/${encodeURIComponent(job.id)}?locale=${locale}`;
  await capture(browser, url, dir);
  const mp4 = `${dir}/film.mp4`;
  const enc = await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/f%05d.jpg`,
    "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "6M", "-bufsize", "12M",
    "-movflags", "+faststart", mp4,
  ], { timeoutMs: 10 * 60_000 });
  if (enc.code !== 0) throw new Error(`ffmpeg failed: ${enc.stderr.slice(0, 300)}`);
  const posterFrame = `${dir}/f${String(Math.round(POSTER_T * FPS)).padStart(5, "0")}.jpg`;
  const out = { video: readFileSync(mp4), poster: readFileSync(posterFrame) };
  rmSync(dir, { recursive: true, force: true });
  return out;
}

/** 낡은 소개 영상 하나를 집어 만든다. 집을 게 없으면 false. */
export async function renderNextIntro(): Promise<boolean> {
  const res = await apiPost<{ job: Job | null }>("/api/worker/intro", { op: "claim" });
  const job = res.job;
  if (!job) return false;
  console.log(`\n[intro] ${job.id} — rendering ${job.locales.join(", ")}`);
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const videos: Record<string, string> = {}, posters: Record<string, string> = {}, ts: string[] = [];
    for (const locale of job.locales) {
      const started = Date.now();
      const { video, poster } = await renderLocale(browser, job, locale);
      const sign = await apiPost<Sign>("/api/worker/intro", { op: "sign", projectId: job.id, locale });
      await putSigned(sign.video, video);
      await putSigned(sign.poster, poster);
      videos[locale] = sign.video.publicUrl;
      posters[locale] = sign.poster.publicUrl;
      ts.push(String(sign.ts));
      console.log(`[intro] ${locale} done in ${Math.round((Date.now() - started) / 1000)}s (${Math.round(video.length / 1e5) / 10}MB)`);
    }
    await apiPost("/api/worker/intro", { op: "done", projectId: job.id, hash: job.hash, videos, posters, ts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[intro] ${job.id} failed: ${message}`);
    await apiPost("/api/worker/intro", { op: "failed", projectId: job.id, hash: job.hash, error: message }).catch(() => {});
  } finally {
    await browser.close();
  }
  return true;
}

// 손으로 한 편: `npx tsx local-runner/intro-render.ts` — 집을 게 있으면 하나 만든다.
if (process.argv[1]?.endsWith("intro-render.ts")) {
  renderNextIntro().then((did) => { console.log(did ? "[intro] done" : "[intro] nothing to render"); process.exit(0); });
}
