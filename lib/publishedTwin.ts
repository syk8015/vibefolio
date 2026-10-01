// 이미 공개된 같은 작품 찾기(2026-10-02, 외부 AI 피드백 NF-19 — 실제로 일어난 일).
//
// 인제스트의 upsert는 **초안만** 본다(공개된 행은 PAT가 절대 못 건드리게). 그래서 이미 공개된
// 작품을 AI가 다시 올리면 새 초안이 생기고, 주인이 그걸 공개하면 명함에 같은 작품이 둘 뜬다
// — 스킨로그가 그렇게 두 장이 됐다(AI의 drafts 목록엔 공개된 작품이 안 보여, 공개됐는지
// 지워졌는지 알 길이 없었다). 판정은 이 함수 하나로 두 곳이 같이 쓴다:
//   - /api/ingest: 새 초안을 만들 차례에 쌍둥이가 있으면 409 PUBLISHED_TWIN(newDraft:true면 통과)
//   - 초안 검토 창: 공개 버튼 위에 "이미 공개된 「…」와 같은 작품 같아요" 경고
//
// 같은 작품으로 보는 기준: 진입 주소가 같거나(외부 URL만 — 파일 업로드 주소는 행마다 달라 비교 불가),
// 제목이 같다(두 언어 판 제목 아무거나 — 파일 업로드는 이게 유일한 단서다).

export interface TwinCandidate {
  id?: string;
  title?: string | null;
  demoUrl?: string | null;
  /** 다른 언어 판 제목들 — `translations` jsonb의 title */
  otherTitles?: readonly (string | null | undefined)[];
}

export interface PublishedTwin {
  id: string;
  title: string;
  /** 무엇이 같았나 — 메시지가 "같은 주소" / "같은 제목"을 정확히 말하게 */
  by: "url" | "title";
}

/** 비교용 주소. 외부 http(s)만 — `/api/preview/<행 id>/…`는 행마다 달라 같은 작품이어도 안 맞는다. */
export function twinUrlKey(raw: string | null | undefined): string | null {
  if (!raw || !/^https?:\/\//i.test(raw.trim())) return null;
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return null;
  }
}

/** 비교용 제목 — 대소문자·전각/반각·공백만 무시한다(구두점까지 지우면 다른 작품이 엮인다). */
export function twinTitleKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return k || null;
}

/** `translations` jsonb → 제목들. 모양이 어긋난 값은 건너뛴다. */
export function translationTitles(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const title = v && typeof v === "object" ? (v as Record<string, unknown>).title : null;
    if (typeof title === "string" && title.trim()) out.push(title);
  }
  return out;
}

/**
 * 후보와 같은 작품으로 보이는 **공개** 작품. 주소가 같은 것을 제목이 같은 것보다 먼저 고른다.
 * `published`는 이미 공개된 행만 넘길 것(초안끼리는 upsert가 따로 다룬다). 자기 자신(id 같음)은 뺀다.
 */
export function findPublishedTwin(
  candidate: TwinCandidate,
  published: readonly (TwinCandidate & { id: string })[],
): PublishedTwin | null {
  const others = published.filter((p) => p.id !== candidate.id);
  const url = twinUrlKey(candidate.demoUrl);
  if (url) {
    const hit = others.find((p) => twinUrlKey(p.demoUrl) === url);
    if (hit) return { id: hit.id, title: hit.title?.trim() || "", by: "url" };
  }
  const keys = new Set(
    [candidate.title, ...(candidate.otherTitles ?? [])].map(twinTitleKey).filter((k): k is string => !!k),
  );
  if (!keys.size) return null;
  const hit = others.find((p) =>
    [p.title, ...(p.otherTitles ?? [])].some((t) => {
      const k = twinTitleKey(t);
      return !!k && keys.has(k);
    }));
  return hit ? { id: hit.id, title: hit.title?.trim() || "", by: "title" } : null;
}
