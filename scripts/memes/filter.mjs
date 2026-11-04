// 매일 밈 밤 작업 — 1차 거르기(2026-11-05). AI 판단 전에 기계적으로 거른다:
// 비싼 반박 검사(6단계)를 덜 돌게 하고, 뻔한 사고는 여기서 끝낸다.
//   hard = 빼기(형식 위반·기존 문구와 같음·분명한 비하 낱말)
//   soft = 통과하되 표시(반박 검사와 검토 화면에서 경보) — 숫자·날짜, 오탐이 잦은 낱말
// 낱말 목록은 '이런 말이 섞였으면 사람이 꼭 보게' 하는 그물이지 판정이 아니다.

export const TEXT_MAX = 120;

// 같은 문구 비교용: 소문자·NFC, 글자·숫자만 남김.
export const normalize = (s) => (s ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
export const lineKey = (l) => `${l.lang}:${normalize(l.text)}|${normalize(l.reply)}`;

// 분명한 비하·혐오 낱말(영어). 단어 경계로만 잡는다.
const HARD_EN = /\b(retard(?:ed)?|f[a@]gg?(?:ot)?s?|n[i1]gg(?:a|er)s?|tr[a@]nn(?:y|ies)|kikes?|spics?|chinks?|wetbacks?)\b/i;
// 분명한 비하·혐오·일베 유래 낱말(한국어). 글자 안 어디에 있어도 잡는다.
const HARD_KO = /(일베|운지|노무(?:현|노)?|MC무현|홍어|삼일한|김치녀|된장녀|한남충|틀딱|급식충|맘충|재기해|부엉이\s*바위|통구이|짱깨|쪽바리|흑형|보슬|창녀|병신|장애인\s*같)/;
// 오탐이 있어 표시만: 영어 논란 낱말·한국어 '~충' 꼴·일베 말끝.
const SOFT_EN = /\b(clankers?|incels?|simps?|based|woke|groomers?|nazi|hitler)\b/i;
const SOFT_KO = /(이기야|(?:하|되|이)노(?=$|\s|[?!])|한남|집게\s*손|허버허버|오조오억|웅앵)/;
// '~충'(사람 비하 꼴)은 보통 낱말(보충·대충·기생충…)과 겹쳐서 그 낱말들은 빼고 본다.
const CHUNG_OK = /(보|확|대|해|곤|유|성|익|회|요|절|완|구|방|살|상|기생|충)충$/;
function hasChungSlur(s) {
  for (const m of s.matchAll(/([가-힣]{1,3})충(?=$|\s|[!?.,~ㅋㅎ])/g)) {
    if (!CHUNG_OK.test(m[1] + "충")) return true;
  }
  return false;
}
// 숫자·날짜: 한국 참사·사건(518, 625, 416, 1029, 1229 …)과 9/11. 날짜 충돌은 반박 검사 C가 문맥을 본다.
const SOFT_NUM = /(?<![\d.])(5\.?18|6\.?25|4\.?16|10\.?29|12\.?29|1\.?23|9\/11|911)(?![\d])|(오일팔|육이오|세월호|이태원)/;

/**
 * @param {{lang:"ko"|"en", text:string, reply?:string|null}} line
 * @param {{ existing?: Set<string> }} ctx  기존 문구 열쇠(lineKey)
 * @returns {{ ok:boolean, hard:string[], soft:string[] }}
 */
export function filterCandidate(line, { existing = new Set() } = {}) {
  const hard = [];
  const soft = [];
  const parts = [line.text, line.reply].filter((s) => typeof s === "string");
  const all = parts.join(" ⁣ ");
  for (const s of parts) {
    if (!s.trim()) hard.push("empty");
    if (s.length > TEXT_MAX) hard.push("too_long");
    if (/[\r\n\t]/.test(s)) hard.push("multi_line");
    // 끝 마침표 하나는 말투 규칙 위반('흠..'·'...' 같은 말줄임은 허용)
    if (/(^|[^.])\.$/.test(s.trim())) hard.push("terminal_period");
  }
  if (!line.text?.trim()) hard.push("no_text");
  if (existing.has(lineKey(line))) hard.push("duplicate_existing");
  if (HARD_EN.test(all) || HARD_KO.test(all)) hard.push("slur_or_hate_word");
  if (SOFT_EN.test(all) || SOFT_KO.test(all) || hasChungSlur(all)) soft.push("contested_word");
  if (SOFT_NUM.test(all)) soft.push("sensitive_number_or_date");
  return { ok: hard.length === 0, hard: [...new Set(hard)], soft };
}
