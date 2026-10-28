// 방문자 판별(lib/visitor.ts, 2026-10-29) — 네트워크 없음.
// 지키는 것: 사람 브라우저를 로봇으로 몰지 않기(인앱 브라우저 포함) · AI가 읽으러 온 것과
// 링크 미리보기를 이름까지 맞히기 · 구체적인 이름(Claude-User)이 넓은 이름(ClaudeBot)에 먹히지 않기.
import { identifyAgent, describeVisitor, primaryLanguage, geoOf } from "../lib/visitor";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const KAKAO_INAPP =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 KAKAOTALK 10.8.0";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const WIN_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";
const HEADLESS = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36";

// 사람 브라우저
for (const [label, ua] of [["아이폰 사파리", IPHONE_SAFARI], ["맥 크롬", MAC_CHROME], ["카톡 인앱", KAKAO_INAPP], ["아이패드", IPAD], ["윈도 엣지", WIN_EDGE]] as const) {
  ok(`${label} = 사람 브라우저`, identifyAgent(ua) === null && describeVisitor(ua).who === "browser");
}
const iphone = describeVisitor(IPHONE_SAFARI);
ok("아이폰 = mobile·iOS·Safari", iphone.device === "mobile" && iphone.os === "iOS" && iphone.browser === "Safari", JSON.stringify(iphone));
const mac = describeVisitor(MAC_CHROME);
ok("맥 = desktop·macOS·Chrome", mac.device === "desktop" && mac.os === "macOS" && mac.browser === "Chrome", JSON.stringify(mac));
ok("아이패드 = tablet", describeVisitor(IPAD).device === "tablet");
ok("엣지는 크롬으로 안 읽힘", describeVisitor(WIN_EDGE).browser === "Edge");
ok("카톡 안드로이드 = mobile·Android", describeVisitor(KAKAO_INAPP).device === "mobile" && describeVisitor(KAKAO_INAPP).os === "Android");

// 자동 브라우저
ok("HeadlessChrome = automation", describeVisitor(HEADLESS).who === "automation");
ok("webdriver 표시 = automation", describeVisitor(MAC_CHROME, true).who === "automation");

// AI — 구체적인 이름이 먼저
const agent = (ua: string | null) => identifyAgent(ua);
ok("Claude-User = Claude(ai)", agent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)")?.name === "Claude");
ok("ClaudeBot = Anthropic crawler", agent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")?.name === "Anthropic crawler");
ok("ChatGPT-User = ChatGPT(ai)", agent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot")?.kind === "ai");
ok("GPTBot ≠ ChatGPT", agent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot")?.name === "OpenAI crawler");
ok("Perplexity-User = Perplexity", agent("Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)")?.name === "Perplexity");

// 링크 미리보기
ok("Discordbot = Discord(preview)", JSON.stringify(agent("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")) === JSON.stringify({ name: "Discord", kind: "preview" }));
ok("Slackbot = Slack", agent("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")?.name === "Slack");
ok("TelegramBot = Telegram", agent("TelegramBot (like TwitterBot)")?.name === "Telegram");
ok("카톡 미리보기 = KakaoTalk(preview)", agent("facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/")?.name === "KakaoTalk");
ok("페이스북 미리보기", agent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")?.name === "Facebook");

// 검색·기타
ok("Googlebot = search", agent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")?.kind === "search");
ok("네이버 Yeti = Naver", agent("Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)")?.name === "Naver");
ok("curl = script", agent("curl/8.7.1")?.kind === "script");
ok("UA 없음 = script", agent("")?.kind === "script" && agent(null)?.kind === "script");

// 언어·위치
ok("언어 첫 칸", primaryLanguage("ko-KR,ko;q=0.9,en-US;q=0.8") === "ko-KR");
ok("이상한 언어 값은 버림", primaryLanguage("<script>") === null && primaryLanguage(null) === null);
const h = new Headers({ "x-vercel-ip-country": "KR", "x-vercel-ip-country-region": "11", "x-vercel-ip-city": "Seoul" });
const g = geoOf(h);
ok("나라·지역·도시", g.country === "KR" && g.region === "11" && g.city === "Seoul", JSON.stringify(g));
ok("도시 이름 URL 인코딩 풀기", geoOf(new Headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" })).city === "São Paulo");
ok("헤더 없으면 전부 null", Object.values(geoOf(new Headers())).every((v) => v === null));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall visitor checks passed");
