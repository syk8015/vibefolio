// 홍보 클립 촬영용 로그인 세션 관리.
//
// local-runner의 녹화 프로필은 매 실행마다 지워지는 disposable Chrome
// 프로필이라(browser.ts ensureEnglishProfile) 쿠키가 안 남는다 — 데모
// 파이프라인은 임의 사이트를 익명으로 탐색하므로 문제없었지만, 프로모 촬영은
// 우리 사이트에 실제로 로그인된 화면(LoggedInHeadline)을 찍어야 한다. 그래서
// 세션(playwright storageState)을 파일로 캐시해 재사용한다.
//
// 세션 "만료"는 여기서 검증하지 않는다 — promo-record.ts가 매 클립마다
// data-promo-tagline-status 마커를 기다리므로, 캐시된 세션이 실제로는
// 로그아웃 상태라면 로그인 후 화면 대신 비로그인 랜딩이 뜨고 그 마커 자체가
// 나타나지 않아 대기가 자연스럽게 타임아웃된다(별도 헬스체크보다 훨씬 가벼움).
// 그 경우 이 파일을 지우고 다시 --login-only로 로그인하면 된다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { launchChromium } from "./browser";
import type { StorageState } from "./browser";
import { PROMO_SESSION_PATH, PROMO_APP_URL } from "./config";
import { sleep } from "./util";

export function loadCachedPromoSession(): StorageState | null {
  if (!existsSync(PROMO_SESSION_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PROMO_SESSION_PATH, "utf8")) as StorageState;
  } catch {
    return null; // corrupt cache — treat as absent, re-login will overwrite it
  }
}

// 이메일/비밀번호 폼 자동 로그인 (app/login/page.tsx의 input[name=email|password]
// + button[type=submit] 셀렉터에 의존). 로컬 dev가 대상이라 보통 Turnstile이
// 없거나 통과되지만, 사이트키가 설정된 dev 환경이면 제출이 막힐 수 있어 그 경우
// 명확한 에러로 --login-only를 안내한다.
async function loginAutomatically(): Promise<void> {
  const email = process.env.PROMO_LOGIN_EMAIL;
  const password = process.env.PROMO_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "PROMO_LOGIN_EMAIL / PROMO_LOGIN_PASSWORD가 .env.local에 없어요 — " +
        "촬영 전용 계정을 만들고(표시 이름을 실명 대신 브랜드에 맞게 설정) 두 값을 채워주세요.",
    );
  }
  const browser = await launchChromium();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${PROMO_APP_URL}/login`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]', { timeout: 15_000 });
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
    const state = await context.storageState();
    writeFileSync(PROMO_SESSION_PATH, JSON.stringify(state));
    console.log(`[promo-session] 자동 로그인 성공 — 세션 저장 (${PROMO_SESSION_PATH})`);
  } catch (e) {
    throw new Error(
      "자동 로그인 실패(Turnstile 캡차가 막았을 가능성) — " +
        `'npx tsx local-runner/promo-worker.ts --login-only'로 직접 로그인해 주세요. ` +
        `원인: ${(e as Error).message}`,
    );
  } finally {
    await browser.close();
  }
}

// 탈출구: 캡차 등으로 자동 로그인이 막힐 때 사람이 직접 로그인한다. 브라우저를
// 열어두고 "/"(로그인 후 홈)로 이동하는 걸 폴링으로 기다렸다가 세션을 캡처한다.
export async function loginManually(): Promise<void> {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${PROMO_APP_URL}/login`);
    console.log("[promo-session] 브라우저 창에서 직접 로그인해 주세요 (최대 5분 대기)...");
    const deadline = Date.now() + 5 * 60_000;
    const home = PROMO_APP_URL.replace(/\/$/, "");
    while (Date.now() < deadline) {
      const url = page.url().replace(/\/$/, "");
      if (url === home) {
        const state = await context.storageState();
        writeFileSync(PROMO_SESSION_PATH, JSON.stringify(state));
        console.log(`[promo-session] 세션 저장 완료 (${PROMO_SESSION_PATH})`);
        return;
      }
      await sleep(1000);
    }
    throw new Error("로그인 대기 시간(5분) 초과 — 다시 --login-only로 시도해 주세요");
  } finally {
    await browser.close();
  }
}

export async function ensurePromoSession(): Promise<StorageState> {
  const cached = loadCachedPromoSession();
  if (cached) return cached;
  await loginAutomatically();
  const state = loadCachedPromoSession();
  if (!state) throw new Error("로그인 후에도 세션 파일을 읽지 못했어요");
  return state;
}
