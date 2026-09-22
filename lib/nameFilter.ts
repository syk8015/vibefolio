// 이름·아이디 금지어 거르기 (2026-09-22) — 욕설·성적인 말·혐오 표현, 그리고 실제
// 회사·서비스 이름(사칭). 아이디는 공개 주소(nookframe.com/{username})이고 이름은
// 명함 맨 위에 찍힌다 — 둘 다 남이 가장 먼저 보는 글자다.
//
// 한계: 완벽한 필터는 없다. 여기서 막는 건 흔한 표기와 흔한 우회(숫자로 바꿔 쓰기·
// 사이에 _ - . 끼우기)까지다. 새로 보이는 단어는 목록에 더한다. 걸린 사람에게는
// "쓸 수 없는 이름"이라고만 알리고 어떤 단어인지는 말하지 않는다.
//
// 오탐을 줄이는 원칙: 멀쩡한 단어 안에 흔히 들어가는 것(ass→class, rape→grape,
// spic→spicy, pedo→torpedo)은 **통째로 같을 때만** 막는다(EXACT). 다른 단어 안에
// 거의 안 들어가는 것만 **들어 있기만 해도** 막는다(CONTAINS).
// 회사 이름은 아이디에서만 "들어 있기만 해도" 막는다 — 이름 칸엔 Claude 같은 실제
// 사람 이름이 오므로 통째로 같을 때만 막는다.

// 욕설·성적인 말·혐오 표현 — 들어 있기만 해도 막는다(소문자·기호 뺀 형태로 비교).
const ABUSE_CONTAINS = [
  "fuck", "shit", "bitch", "bastard", "asshole", "dickhead", "motherf", "cunt", "wank",
  "bollock", "twat",
  "porn", "hentai", "blowjob", "handjob", "dildo", "vagina", "penis", "boob",
  "pussy", "orgasm", "masturb", "nsfw", "milf", "sex", "xxx",
  "onlyfans", "pornhub", "xvideos", "lolicon",
  "nigger", "nigga", "faggot", "retard", "chink", "kike", "tranny", "nazi", "hitler", "kkk",
  // 한글 — 이름 칸에만 들어올 수 있다(아이디는 영문 소문자뿐).
  "씨발", "시발", "씨빨", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "좆", "존나", "지랄", "ㅈㄹ",
  "개새끼", "새끼", "미친놈", "미친년", "썅", "느금",
  "섹스", "보지", "자지", "야동", "강간", "몰카", "창녀",
  "틀딱", "한남충", "김치녀", "짱깨", "쪽바리",
];

// 통째로 같을 때만 막는다 — 흔한 단어 안에 들어가는 짧은 것.
const ABUSE_EXACT = [
  "ass", "cum", "tit", "tits", "fag", "dick", "piss", "slut", "whore", "hoe", "cock",
  "rape", "pedo", "spic", "prick", "nude", "loli",
];

// 실제 회사·서비스 이름(사칭). 아이디: 들어 있기만 해도 / 이름: 통째로 같을 때만.
const BRANDS_DISTINCT = [
  "google", "youtube", "gmail", "microsoft", "openai", "chatgpt", "anthropic", "claude",
  "samsung", "netflix", "instagram", "facebook", "whatsapp", "tiktok", "twitter", "linkedin",
  "github", "paypal", "nvidia", "tesla", "disney", "nintendo", "playstation", "coupang",
  "kakao", "naver", "nookframe", "vercel", "supabase", "lovable", "replit",
  "삼성", "네이버", "카카오", "구글", "쿠팡", "넷플릭스", "유튜브", "누크프레임",
];
// 일반 명사이기도 한 회사 이름 — 아이디·이름 모두 통째로 같을 때만.
const BRANDS_EXACT = [
  "apple", "meta", "amazon", "adobe", "intel", "oracle", "sony", "uber", "airbnb", "spotify",
  "x", "line", "gemini", "copilot", "figma", "notion", "slack", "discord", "reddit", "zoom",
  "cursor", "toss", "애플", "토스",
];

const SEPARATORS = /[\s_\-.·~*]+/g;

// 흔한 우회 풀기: 숫자·기호를 글자로 되돌리고 사이에 끼운 기호를 뺀다.
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a")
    .replace(/5/g, "s").replace(/7/g, "t").replace(/\$/g, "s").replace(/@/g, "a")
    .replace(SEPARATORS, "");
}

// 금지어가 있으면 true. kind에 따라 회사 이름을 얼마나 세게 보는지만 다르다.
export function hasBlockedTerm(value: string, kind: "username" | "name"): boolean {
  if (!value) return false;
  const forms = [value.toLowerCase().replace(SEPARATORS, ""), fold(value)];
  const exact = [...ABUSE_EXACT, ...BRANDS_EXACT, ...(kind === "name" ? BRANDS_DISTINCT : [])];
  const contains = [...ABUSE_CONTAINS, ...(kind === "username" ? BRANDS_DISTINCT : [])];
  return forms.some((f) => exact.includes(f) || contains.some((w) => f.includes(w)));
}
