import type { Project } from "@/lib/data";

// content_type id → 한국어 라벨.
// components/ProjectCard.tsx의 CONTENT_TYPE_MAP, components/dashboard/ProjectsTab.tsx의
// CONTENT_TYPES와 반드시 동일하게 유지할 것. (새 필드를 만들지 않고 기존 값에서 파생)
const CONTENT_TYPE_LABELS: Record<string, string> = {
  "web-app": "웹 앱",
  "saas": "SaaS",
  "mobile": "모바일 앱",
  "game": "게임",
  "extension": "크롬 익스텐션",
  "ai-service": "AI 서비스",
  "media": "미디어 컨텐츠",
  "other": "기타",
};

export interface IdentityProfile {
  name?: string | null;
  bio?: string | null;
}

export interface IdentityLine {
  // "주로 웹 앱을 만듭니다" / "주로 웹 앱과 SaaS를 만듭니다" / bio 첫 줄(폴백).
  // 모든 폴백이 비면 undefined → 호출부가 이름만 표시.
  headline?: string;
  // tags(AI 도구) 빈도 상위 최대 2개. 비면 빈 배열.
  tools: string[];
}

// 마지막 (공백 아닌) 글자에 한글 받침이 있는지. 영문/숫자 등 비한글은 false
// (받침 없음으로 취급 → "SaaS를", "SaaS와"가 자연스럽게 나옴).
function hasFinalConsonant(word: string): boolean {
  const trimmed = word.trimEnd();
  if (!trimmed) return false;
  const code = trimmed.charCodeAt(trimmed.length - 1);
  // 한글 음절(가–힣) 영역에서만 받침 계산
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0;
  }
  return false;
}

// 목적격 조사 을/를
function objectParticle(word: string): string {
  return hasFinalConsonant(word) ? "을" : "를";
}

// 접속 조사 와/과
function andParticle(word: string): string {
  return hasFinalConsonant(word) ? "과" : "와";
}

function topByFrequency<T>(items: T[]): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  // Map은 삽입 순서를 보존하고 Array.sort는 안정 정렬 → 동률이면 먼저 등장한 항목이 앞.
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 사용자의 기존 프로젝트 데이터에서 "한 줄 정체성"을 파생한다 (순수 함수, 새 DB 필드 없음).
 *
 *  1) content_type 최빈값 → "주로 {라벨}{을/를} 만듭니다" (관찰형, 한국어 조사 자동).
 *     1·2위가 근접(1위 < 2위×2)하면 "주로 {1위}{와/과} {2위}{을/를} 만듭니다".
 *  2) tags(AI 도구) 빈도 상위 최대 2개.
 *  폴백: content_type이 전무 → bio 첫 줄(~40자 말줄임) → 그것도 없으면 headline 생략.
 */
export function buildIdentityLine(projects: Project[], profile: IdentityProfile): IdentityLine {
  // ── ① 종류 구절 ──────────────────────────────────────────────
  const typeIds = projects
    .map((p) => p.contentType)
    .filter((id): id is string => !!id && !!CONTENT_TYPE_LABELS[id]);
  const rankedTypes = topByFrequency(typeIds);

  let headline: string | undefined;

  if (rankedTypes.length > 0) {
    const first = rankedTypes[0];
    const second = rankedTypes[1];
    const firstLabel = CONTENT_TYPE_LABELS[first.value];

    if (second && first.count < second.count * 2) {
      // 1·2위 근접 → 두 종류 모두 언급
      const secondLabel = CONTENT_TYPE_LABELS[second.value];
      headline = `주로 ${firstLabel}${andParticle(firstLabel)} ${secondLabel}${objectParticle(secondLabel)} 만듭니다`;
    } else {
      // 단독 1위(또는 2배 이상 우세)
      headline = `주로 ${firstLabel}${objectParticle(firstLabel)} 만듭니다`;
    }
  } else if (profile.bio) {
    // 폴백: bio 첫(비어있지 않은) 줄, ~40자 말줄임
    const firstLine = profile.bio
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean);
    if (firstLine) {
      headline = firstLine.length > 40 ? `${firstLine.slice(0, 40).trimEnd()}…` : firstLine;
    }
  }
  // 위 모두 실패 → headline undefined (호출부에서 이름만 노출)

  // ── ② 툴 구절: tags 빈도 상위 최대 2개 ───────────────────────
  const allTags = projects.flatMap((p) => (p.tags ?? []).filter(Boolean));
  const tools = topByFrequency(allTags)
    .slice(0, 2)
    .map((t) => t.value);

  return { headline, tools };
}
