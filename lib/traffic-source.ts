// Traffic-source classification (T7b) — turns the three weak signals we have
// into one honest channel label. Messenger/SNS in-app browsers (KakaoTalk,
// Instagram, Threads…) strip the Referer header, so referrer alone reads as
// "직접/알 수 없음"; their app WebViews DO sign the User-Agent though, and
// portfolio_views has stored user_agent from day one — so this classifies
// retroactively too.
//
// Priority: in-app UA signature (definitive) → referrer host map (this app's
// own Vercel preview deploys → 로컬 테스트) → bare referrer host → share-link
// `via` param → 직접/알 수 없음. Pure TS, shared by
// the admin tower (batch) and /api/analytics (per-event, server-side).

// 바깥 유입이 아닌 세 칸 — 방문 탭의 "밖에서 온 방문은 …이 가장 많아요"가 이 셋을 뺀다.
const INSIDE = "Nookframe 안에서";
const LOCAL_TEST = "로컬 테스트(localhost)";
const DIRECT = "직접/알 수 없음";

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
  // 구글 로그인 창에서 돌아온 방문 — 명함에서 로그인하러 잠깐 나갔다 온 것이라 밖에서 새로
  // 들어온 유입이 아니다. 따로 "(구글 로그인 리턴)"이라 적었더니 주인 화면에서 뜻을 몰라
  // 안에서 넘어온 방문으로 합친다(2026-09-27 사용자 결정 2C). google.com보다 먼저 와야 한다.
  ["accounts.google.com", INSIDE],
  ["google.com", "구글 검색"],
  // 우리 사이트 안에서 넘어온 방문(작품 페이지 → 명함 등). 옛 도메인도 같은 곳이다 —
  // 도메인 그대로 두면 주인 화면에 "nookframe.com"이 외부 유입처처럼 떴다.
  ["nookframe.com", INSIDE],
  ["vibefolio-beta.vercel.app", INSIDE],
  // 개발 서버 화면에서 누른 링크 — 방문자가 아니라 만드는 사람의 테스트.
  ["localhost", LOCAL_TEST],
  ["127.0.0.1", LOCAL_TEST],
];

// 이 앱의 Vercel 미리보기 배포 — 커밋마다(vibefolio-<해시>-syk8015s-projects.vercel.app)·
// 브랜치마다(vibefolio-git-<브랜치>-…) 생기는 주소도 만드는 사람의 시험이라 localhost와 같은 칸이다.
// 도메인 그대로 두면 주인 화면 유입 경로에 "vibefolio-odycvyr93-syk8015s-projec…"이 바깥 사이트처럼
// 떴다(2026-10-02). 운영 별칭 vibefolio-beta.vercel.app은 위 표대로 안에서.
const PREVIEW_HOSTS = [
  /^vibefolio-[a-z0-9-]+-syk8015s-projects\.vercel\.app$/,
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

// 브라우저가 보내 주는 유입 주소(document.referrer)를 저장 전에 다듬는다(2026-10-02).
// 이 값은 브라우저가 스스로 적어 보내는 것이라 서버가 진위를 확인할 수 없다 — 아무 글자나 넣어
// 주인 방문 탭에 가짜 유입처를 띄울 수 있었다. 그래서 http(s) 주소이고 호스트가 도메인 모양일 때만
// 받고, 남기는 건 "https://호스트"뿐이다(경로·쿼리에는 남의 토큰·이메일이 실려 올 수 있다).
// 분류(classifyTrafficSource)와 관제탑(refHost)은 호스트만 보므로 잃는 게 없다.
const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
export function cleanReferrer(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim() || v.length > 2048) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname.toLowerCase();
    if (!HOSTNAME_RE.test(h)) return null;
    if (!h.includes(".") && h !== "localhost") return null;
    return `${u.protocol}//${h}`;
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
      if (PREVIEW_HOSTS.some((re) => re.test(h))) return LOCAL_TEST;
      return h; // 모르는 도메인은 도메인 그대로 — 새 유입처가 스스로 드러나게
    }
  }

  const via = typeof input.via === "string" ? VIA_LABEL[input.via] : undefined;
  if (via) return via;

  return DIRECT;
}

// classifyTrafficSource의 라벨이 바깥에서 온 방문인가 — 우리 사이트 안·직접/알 수 없음·로컬 테스트는 아니다.
export function isOutsideSource(label: string): boolean {
  return label !== INSIDE && label !== LOCAL_TEST && label !== DIRECT;
}

// 앱 안 브라우저(웹뷰)인가 — 가입·로그인 화면이 "외부 브라우저로 열어 주세요"를
// 띄우는 근거(2026-09-22 D5). 구글은 웹뷰에서 오는 OAuth를 403
// `disallowed_useragent`로 막을 때가 있다(앱·기기마다 다름 — 09-24 인스타 실기기에선 됨).
// 위 UA 서명이 전부 앱 웹뷰라 같은 목록을 쓴다.
export function isInAppBrowser(userAgent: string): boolean {
  return UA_SIGNATURES.some(([re]) => re.test(userAgent));
}
