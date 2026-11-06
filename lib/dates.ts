// 사람이 읽는 날짜·시각(docs/brand.md §11 '날짜·시각', 2026-11-06).
// 날짜는 달 이름 — Nov 6 / 11월 6일, 올해가 아니면 연도를 붙인다. 숫자만 쓴 11/6/2026은 나라마다 달리 읽혀서 쓰지 않는다.
// 시각은 한 가지 — 2:05 PM / 오후 2:05. 기록·확인 도장(고정폭 사실)은 여기 말고 2026-11-06(ISO)로 쓴다.
type Locale = "ko" | "en";

const tag = (locale: Locale) => (locale === "ko" ? "ko-KR" : "en-US");

function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nov 6 · Nov 6, 2025 · 11월 6일 · 2025년 11월 6일 */
export function formatDay(v: Date | string | number, locale: Locale, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(tag(locale), { month: locale === "ko" ? "long" : "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Nov 6, 2:05 PM · 11월 6일 오후 2:05 (올해가 아니면 연도 포함) */
export function formatDayTime(v: Date | string | number, locale: Locale, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString(tag(locale), {
    month: locale === "ko" ? "long" : "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** 마우스를 올렸을 때 보이는 전체 — Thursday, November 6, 2026 at 2:05:33 PM */
export function formatFull(v: Date | string | number, locale: Locale): string {
  const d = toDate(v);
  return d ? d.toLocaleString(tag(locale), { dateStyle: "full", timeStyle: "medium", hour12: true }) : "";
}
