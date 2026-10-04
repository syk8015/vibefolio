// 소개 영상 틀(장르) 한 벌의 모양 — 틀마다 "그 물건의 세계"가 하나씩 있다(영수증 프린터·터미널·휴대용 LCD…).
// 2026-10-04 필름 실험실(24개 시안 → 사용자가 고른 것만 들어온다). 기준: nookframe-작업물/.../film-style/STANDARD.md
//
// 지킬 것(npm test `probe-intro-film-unit`이 이 폴더를 검사한다): render(g, t)는 t의 순수 함수다.
// 시계·애니메이션 프레임·타이머·시드 없는 난수를 쓰지 않는다. 오프스크린 캔버스는 make() 안에서만 만든다.

/** 한 언어로 펼친 장면(Loc → 글자). 칸 이름은 schema.ts와 같다. */
export type FlatScene =
  | { kind: "hook"; label: string; value: string; line: string; alarm?: boolean; data?: "sample" | "measured"; source?: string }
  | { kind: "story"; line: string; line2: string; data?: "sample" | "measured"; source?: string }
  | { kind: "items"; items: { value: string; label: string; alarm?: boolean }[]; line: string; data?: "sample" | "measured"; source?: string }
  | { kind: "flow"; nodes: string[]; line: string; data?: "sample" | "measured"; source?: string }
  | { kind: "terminal"; command: string; output: string[]; line: string; data?: "sample" | "measured"; source?: string }
  | { kind: "alert"; title: string; body: string; line: string; line2: string; data?: "sample" | "measured"; source?: string }
  | { kind: "stats"; stats: { value: string; unit: string; label: string }[]; line: string; data?: "sample" | "measured"; source?: string }
  | { kind: "ending"; line: string; line2: string; name: string; data?: "sample" | "measured"; source?: string };

/** 틀이 받는 작품 — 진짜 내용이 곧 영상마다 다른 얼굴이다. */
export type GenreWork = {
  /** 작품 id — 같은 틀 안에서도 작품마다 배치가 갈리는 씨앗. */
  id: string;
  title: string;
  /** 주인 아이디(@ 없이) — 끝 2초 넘김 줄(nookframe.com/@handle). */
  handle: string;
  locale: "en" | "ko";
  /** 작품의 대표색·경고색(없으면 null — 틀이 제 잉크로 완성돼야 한다). */
  accent: string | null;
  alarm: string | null;
  scenes: FlatScene[];
};

/**
 * 틀이 쓰는 글꼴 — 논리 이름 → 캔버스 font-family 목록(따옴표 포함, 한국어면 한글 대체 글꼴이 뒤에 붙어 있다).
 * 실제 파일은 화면 쪽(components/introFilm/fonts.ts)이 next/font로 우리 서버에서 내려준다.
 */
export type GenreFonts = Record<string, string>;

export type GenreFilm = {
  duration: number;
  /** 장면마다 시작 시각(초) — work.scenes와 같은 길이·순서. 검토 창이 재생 중인 장면을 칠하고, 장면을 누르면 거기로 간다. */
  starts: number[];
  /** 1600×900 논리 좌표로 이미 맞춰진 캔버스에 시간 t의 화면 한 장을 통째로 그린다. */
  render(g: CanvasRenderingContext2D, t: number): void;
};

export type Genre = {
  id: string;
  name: string;
  /** 검토 창에 보일 짧은 한국어 이름·한 줄 소개. */
  ko: string;
  koIdea: string;
  enIdea: string;
  /** A 기계·화면 · B 인쇄·종이 · C 영화·방송 · D 장소·체계 · E 예술·기하 — 한 주인의 작품끼리 겹치지 않게 고를 때 쓴다. */
  family: "A" | "B" | "C" | "D" | "E";
  /** 이 틀이 쓰는 논리 글꼴 이름들(GenreFonts의 키). */
  fonts: string[];
  make(work: GenreWork, opt: { seed: number; fonts: GenreFonts }): GenreFilm;
};
