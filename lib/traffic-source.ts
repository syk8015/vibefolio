// Traffic-source classification (T7b) — turns the three weak signals we have
// into one honest channel label. Messenger/SNS in-app browsers (KakaoTalk,
// Instagram, Threads…) strip the Referer header, so referrer alone reads as
// "직접/알 수 없음"; their app WebViews DO sign the User-Agent though, and
// portfolio_views has stored user_agent from day one — so this classifies
// retroactively too.
//
// Priority: in-app UA signature (definitive) → referrer host map → bare
// referrer host → share-link `via` param → 직접/알 수 없음. Pure TS, shared by
// the admin tower (batch) and /api/analytics (per-event, server-side).

const UA_SIGNATURES: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/Instagram/i, "인스타그램"],
  [/Barcelona/i, "Threads"], // Threads 앱 WebView의 UA 토큰
  [/FBAN|FBAV|FB_IAB/i, "페이스북"],
  [/\bLine\//i, "라인"],
  [/NAVER\(inapp|NAVER\//i, "네이버 앱"],
  [/DaumApps/i, "다음 앱"],
  [/TwitterAndroid|Twitter for iPhone/i, "X 앱"],
];

// Known referrer hosts → channel. endsWith matching so link-shim subdomains
// (l.threads.net, l.instagram.com, lm.facebook.com…) fold into their channel.
const REF_HOST_MAP: [string, string][] = [
  ["t.co", "X"],
  ["x.com", "X"],
  ["twitter.com", "X"],
  ["threads.net", "Threads"],
  ["threads.com", "Threads"],
  ["instagram.com", "인스타그램"],
  ["facebook.com", "페이스북"],
  ["kakao.com", "카카오"],
  ["naver.com", "네이버"],
  ["youtube.com", "유튜브"],
  ["youtu.be", "유튜브"],
  ["linkedin.com", "LinkedIn"],
  ["news.ycombinator.com", "Hacker News"],
  ["reddit.com", "Reddit"],
  ["disquiet.io", "Disquiet"],
  ["slack.com", "Slack"],
  ["notion.so", "Notion"],
  ["accounts.google.com", "(구글 로그인 리턴)"],
  ["google.com", "구글 검색"],
];

const VIA_LABEL: Record<string, string> = {
  share: "공유 링크(앱 미상)",
  x: "X",
};

function host(ref: string): string | null {
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function classifyTrafficSource(input: {
  referrer?: unknown;
  userAgent?: unknown;
  via?: unknown;
}): string {
  const ua = typeof input.userAgent === "string" ? input.userAgent : "";
  for (const [re, label] of UA_SIGNATURES) {
    if (re.test(ua)) return label;
  }

  const ref = typeof input.referrer === "string" && input.referrer ? input.referrer : null;
  if (ref) {
    const h = host(ref);
    if (h) {
      for (const [suffix, label] of REF_HOST_MAP) {
        if (h === suffix || h.endsWith(`.${suffix}`)) return label;
      }
      return h; // 모르는 도메인은 도메인 그대로 — 새 유입처가 스스로 드러나게
    }
  }

  const via = typeof input.via === "string" ? VIA_LABEL[input.via] : undefined;
  if (via) return via;

  return "직접/알 수 없음";
}
