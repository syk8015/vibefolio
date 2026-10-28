// 방문자 판별(2026-10-29) — 방문 한 건이 어디서(나라·도시), 무엇으로(기기·브라우저),
// 누가(사람 브라우저 / 자동 브라우저 / AI / 링크 미리보기 / 검색 로봇) 왔는지.
//
// 왜: 10/25 저녁 첫 화면에 44명이 몰렸는데 출처가 전부 "직접/알 수 없음"이었다. 접속
// 기록(Vercel)은 한 시간 뒤 지워지고, landing_view엔 나라·기기가 없어 무엇도 좁힐 수 없었다.
//
// 두 길로 쓰인다:
//  - /api/analytics — JS가 도는 방문(landing_view·watch_view)에 서버가 나라·기기·누구를 찍는다.
//  - middleware — JS를 안 도는 로봇(AI가 주소를 읽으러 온 것, 메신저 링크 미리보기)을
//    페이지 요청에서 바로 알아본다. 미리보기 로봇은 "누가 어디에 주소를 붙여 넣었나"를 알려 준다.
//
// UA는 꾸밀 수 있다 — 이건 방어선이 아니라 이름표다. 사람의 진짜 브라우저를 AI가 대신
// 조작하는 경우(브라우저 확장형 에이전트)는 UA로 구별되지 않는다.
// 순수 TS(임포트 없음) — middleware·라우트·프로브가 같이 쓴다.

export type AgentKind = "ai" | "preview" | "search" | "script";

export interface KnownAgent {
  name: string;
  kind: AgentKind;
}

// 순서가 중요하다 — 구체적인 것(Claude-User)이 넓은 것(ClaudeBot)보다 먼저.
const KNOWN_AGENTS: [RegExp, string, AgentKind][] = [
  // AI — "-User"는 사람이 AI에게 이 주소를 물어서 읽으러 온 것, 나머지는 검색 색인·학습 수집
  [/ChatGPT-User/i, "ChatGPT", "ai"],
  [/OAI-SearchBot/i, "ChatGPT search", "ai"],
  [/GPTBot/i, "OpenAI crawler", "ai"],
  [/Claude-User/i, "Claude", "ai"],
  [/Claude-SearchBot/i, "Claude search", "ai"],
  [/ClaudeBot|anthropic-ai/i, "Anthropic crawler", "ai"],
  [/Perplexity-User/i, "Perplexity", "ai"],
  [/PerplexityBot/i, "Perplexity search", "ai"],
  [/MistralAI-User/i, "Mistral", "ai"],
  [/DuckAssistBot/i, "DuckDuckGo AI", "ai"],
  [/meta-externalagent|meta-externalfetcher/i, "Meta AI", "ai"],
  [/Bytespider/i, "ByteDance crawler", "ai"],
  [/Amazonbot/i, "Amazon", "ai"],
  [/CCBot/i, "Common Crawl", "ai"],
  [/cohere-ai/i, "Cohere", "ai"],
  [/YouBot/i, "You.com", "ai"],
  // 링크 미리보기 — 누가 그 서비스에 주소를 붙여 넣은 순간 한 번 온다
  [/Discordbot/i, "Discord", "preview"],
  [/Slackbot|Slack-ImgProxy/i, "Slack", "preview"],
  [/TelegramBot/i, "Telegram", "preview"],
  [/WhatsApp/i, "WhatsApp", "preview"],
  [/kakaotalk-scrap/i, "KakaoTalk", "preview"],
  [/facebookexternalhit|facebookcatalog/i, "Facebook", "preview"],
  [/Twitterbot/i, "X", "preview"],
  [/LinkedInBot/i, "LinkedIn", "preview"],
  [/redditbot/i, "Reddit", "preview"],
  [/Cardyb/i, "Bluesky", "preview"],
  [/Mastodon\//i, "Mastodon", "preview"],
  [/SkypeUriPreview/i, "Skype", "preview"],
  [/Iframely|Embedly/i, "Embed service", "preview"],
  // 검색 로봇
  [/Googlebot|Google-InspectionTool|GoogleOther/i, "Google", "search"],
  [/bingbot|BingPreview/i, "Bing", "search"],
  [/Yeti\//i, "Naver", "search"],
  [/Daumoa/i, "Daum", "search"],
  [/DuckDuckBot/i, "DuckDuckGo", "search"],
  [/Applebot/i, "Apple", "search"],
  [/YandexBot/i, "Yandex", "search"],
  [/Baiduspider/i, "Baidu", "search"],
];

// 이름 모를 로봇·스크립트 — /api/track의 NON_BROWSER_UA와 같은 거름망.
const GENERIC_NON_BROWSER =
  /bot|crawl|spider|slurp|curl|wget|python|httpx|axios|node-fetch|undici|go-http|java\/|okhttp|libwww|scrapy/i;
// 화면 없이 도는 자동 브라우저 — JS는 돌지만 사람이 아니다.
const HEADLESS = /HeadlessChrome|PhantomJS|puppeteer|playwright|jsdom/i;

/** 알려진 로봇이면 이름과 종류, 사람 브라우저로 보이면 null. */
export function identifyAgent(ua: string | null | undefined): KnownAgent | null {
  const s = ua ?? "";
  if (!s.trim()) return { name: "no user-agent", kind: "script" };
  for (const [re, name, kind] of KNOWN_AGENTS) if (re.test(s)) return { name, kind };
  if (GENERIC_NON_BROWSER.test(s)) return { name: "other bot", kind: "script" };
  return null;
}

export type VisitorKind = "browser" | "automation" | AgentKind;

export interface Visitor {
  who: VisitorKind;
  agent: string | null;
  device: "mobile" | "tablet" | "desktop";
  os: string;
  browser: string;
}

/**
 * 방문 한 건의 누구·기기. `webdriver`는 브라우저가 스스로 밝힌 자동화 표시
 * (navigator.webdriver — Playwright·Selenium 같은 조종 도구가 켜 둔다).
 */
export function describeVisitor(ua: string | null | undefined, webdriver = false): Visitor {
  const s = ua ?? "";
  const known = identifyAgent(s);
  let who: VisitorKind = known?.kind ?? "browser";
  if (!known && (webdriver || HEADLESS.test(s))) who = "automation";
  return {
    who,
    agent: known?.name ?? null,
    device: deviceOf(s),
    os: osOf(s),
    browser: browserOf(s),
  };
}

function deviceOf(s: string): Visitor["device"] {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(s)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(s)) return "mobile";
  return "desktop";
}

function osOf(s: string): string {
  if (/iPhone|iPad|iPod/i.test(s)) return "iOS";
  if (/Android/i.test(s)) return "Android";
  if (/CrOS/i.test(s)) return "ChromeOS";
  if (/Windows/i.test(s)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(s)) return "macOS";
  if (/Linux/i.test(s)) return "Linux";
  return "other";
}

function browserOf(s: string): string {
  if (/Whale\//i.test(s)) return "Whale";
  if (/SamsungBrowser/i.test(s)) return "Samsung";
  if (/Edg(e|A|iOS)?\//i.test(s)) return "Edge";
  if (/OPR\/|Opera/i.test(s)) return "Opera";
  if (/Firefox|FxiOS/i.test(s)) return "Firefox";
  if (/Chrome|CriOS/i.test(s)) return "Chrome";
  if (/Safari/i.test(s)) return "Safari";
  return "other";
}

/** Accept-Language의 첫 언어(예: "ko-KR,ko;q=0.9" → "ko-KR"). */
export function primaryLanguage(acceptLanguage: string | null | undefined): string | null {
  const first = (acceptLanguage ?? "").split(",")[0]?.split(";")[0]?.trim();
  return first && /^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(first) ? first.slice(0, 16) : null;
}

/** Vercel이 붙여 주는 나라·지역·도시(도시는 URL 인코딩돼 온다). 로컬에선 전부 null. */
export function geoOf(h: Pick<Headers, "get">): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const clean = (v: string | null, max: number) => {
    if (!v) return null;
    let t = v;
    try {
      t = decodeURIComponent(v);
    } catch {
      // 깨진 인코딩은 원문 그대로
    }
    t = t.trim();
    return t ? t.slice(0, max) : null;
  };
  return {
    country: clean(h.get("x-vercel-ip-country"), 8),
    region: clean(h.get("x-vercel-ip-country-region"), 16),
    city: clean(h.get("x-vercel-ip-city"), 64),
  };
}
