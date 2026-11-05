// 공유 미리보기 언어(2026-11-05) — 언어 정보 없는 요청은 영어, 카카오톡 미리보기 로봇만 한국어, 그림도 같은 언어.
import { existsSync } from "node:fs";
import { fallbackLocale } from "../lib/i18n/config";
import { siteShareImage } from "../lib/siteShareImage";

let failed = 0;
const check = (name: string, ok: boolean) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${name}`); };

const UA = {
  kakao: "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/docs/kakaotalk-scrap",
  twitter: "Twitterbot/1.0",
  meta: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  slack: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  google: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};
check("카카오톡 미리보기 → ko", fallbackLocale(UA.kakao) === "ko");
for (const k of ["twitter", "meta", "slack", "google"] as const) check(`${k} → en`, fallbackLocale(UA[k]) === "en");
check("머리표 없음 → en", fallbackLocale(null) === "en" && fallbackLocale("") === "en");
for (const l of ["ko", "en"] as const) {
  const img = siteShareImage(l);
  check(`${l} 그림 파일 있음 (${img.url})`, existsSync(`public${img.url}`));
}
check("두 언어 그림이 다름", siteShareImage("ko").url !== siteShareImage("en").url);
check("옛 파일 규칙 그림이 없음(설정을 덮어써서 언어를 못 고름)", !existsSync("app/opengraph-image.png") && !existsSync("app/twitter-image.png"));
process.exit(failed ? 1 : 0);
