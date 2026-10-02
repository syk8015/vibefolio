"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { toPreviewUrl } from "@/lib/previewOrigin";
import { detectVideoKind, getYouTubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video";
import { previewDevice, normalizeTargetDevice } from "@/lib/projectTaxonomy";
import { isStepWired } from "@/lib/demoScript";
import { detectDemoSource } from "@/lib/demoSource";
import { descriptionShapeIssue, descriptionTooLong, lineCols, DESCRIPTION_LINE_COLS_MAX } from "@/lib/descriptionShape";
import { buildDraftFixPrompt } from "@/lib/draftFixPrompt";
import { copyText, copyTextLater } from "@/lib/clipboard";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ManualCopyBox } from "@/components/dashboard/ManualCopyBox";
import { DemoScriptPanel, holdOf } from "./DemoScriptPanel";
import { OwnerInterviewPanel } from "./OwnerInterviewPanel";
import { LanguagePanel, type DetailRow } from "./LanguagePanel";
import { VisitorFrame } from "./VisitorFrame";
import { MiniStage, MiniWork, NoteBubble, captionText } from "./WorkCardPreview";
import { PublishTrail, PublishedMark, type TrailStep } from "./PublishTrail";
import { filmPlan, normalizeAppLanguages, normalizeLocale, otherLocale, readTranslations } from "@/lib/workLanguages";
import { PreviewDevice, PHONE_VIEW, DESKTOP_VIEW } from "./PreviewDevice";
import { type DBProject } from "./types";
import { type PublishedTwin } from "@/lib/publishedTwin";
import { readOwnerInterview, type OwnerInterview } from "@/lib/ownerInterview";
import { useT } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { introFilmIssue, filmSeconds as introSeconds, SCENE_SECONDS, type IntroFilm } from "@/lib/introFilm/schema";
import IntroFilmPlayer, { type IntroFilmHandle } from "@/components/introFilm/IntroFilmPlayer";
import { StageChip } from "@/components/theater/StageMarks";
import { IntroFilmPanel, issueTarget } from "./IntroFilmPanel";

// 초안 검토 모달 — [공개하기]의 "확인"을 실제로 할 수 있는 화면.
//
// 2026-09-15 재편(토스식 정보 표현, 사용자 확정 시안 2판 — 기억 reference-toss-ux):
// - 창을 화면의 ~90%(최대 1360px)로 넓혀 두 칸으로 나눈다. 왼쪽=미리보기, 오른쪽=판단.
//   두 칸이 따로 스크롤돼서 iframe 위에서 휠을 굴려도 판단 칸이 막히지 않는다.
// - 미리보기 틀(폰 402×874 / PC 1280×800)은 업로드한 AI가 답한 targetDevice로만 정한다.
//   사람이 바꾸는 스위치는 일부러 없다. 답이 없는 예전 초안은 분류로 짐작(previewDevice).
//
// 2026-10-01 덜어내기 "라"(사용자가 고른 시안): 판단 칸은 "공개할까요?" 아래에
// ① 방문자가 볼 모습(구석의 KO/EN으로 두 언어 판을 번갈아 봄)
// ② 체크 한 줄 "인터뷰 답이 내 말과 같아요" + [답 보기] — 체크해야 공개 버튼이 눌린다(09-29 필수)
// ③ 촬영 한 줄 "N장면 · 약 N초 · 영어 자막 포함" + [보기] — 펼치면 장면 막대(장면을 누르면
//    옮기기·빼기 카드)·자막·언어/로그인 작은 표. 문제(위치 모르는 장면·로그인 답 없음)만 늘 빨갛게.
// 버튼은 가운데 [고칠 점 적기] + [공개하고 촬영 요청]. 버튼 아래 안내 문장은 두지 않는다.
// 작품 유형·연도·AI 도구·주소·촬영 힌트는 ⋯ [직접 고치기](수정 창)에서 보고 고친다.
//
// 2026-10-01 "업그레이드"(라 위에 더한 것): 배지는 제목과 한 줄에. 방문자 미리보기는 방문자가 볼 작은
// 브라우저 틀(주소 nookframe.com/아이디, KO/EN은 그 주소 줄) 안에 있다.
// 버튼 바로 위 작은 세 단계 "공개 → 촬영 → 프레임에 영상". 공개하면 창을 닫지 않고 이 자리가
// "공개했어요"(큰 체크 · 작은 프레임 · [링크 복사] [내 프레임 보기])로 바뀐다 — draft.is_draft가 false가 되는
// 것으로 안다(ProjectsTab이 공개 목록으로 옮긴 같은 행을 계속 넘긴다. 실패하면 초안으로 돌아와 검토 화면으로).
//
// 2026-10-02 덜어내기 2차: 틀 안은 새 공개 프레임 페이지(TheaterStage 무대 + StageCaption 이름표)를 작게
// 그린 것이다 — 우리 글을 더는 어두운 카드 위 흰 글씨로 얹지 않는다. 위에 짧은 어두운 무대 띠(왼쪽 위
// "▶ 자동 시연 · 약 N초", 바닥에 꾸밈용 재생 막대), 그 밑 페이지 바탕에 이름표 — 세리프 제목 · 줄바꿈을
// 풀어 흘린 소개글(둘 다 2줄) · 흐린 한 줄 "AI 도구 · 연도" · 한마디는 '만든이 메모' 말풍선(칸이 좁으면
// 공개 페이지처럼 글 밑 오른쪽). 무대 띠만 늘 어둡고 나머지는 테마 변수다. 띠·말풍선·글 모양은
// 작품 고치기 창 미리보기(WorkCardPreview)와 같은 조각을 쓴다.
//
// 살짝 고치기: 미리보기의 제목·소개글·한마디는 글자를 누르면 그 자리에서 밝은 입력칸(.vf-input)으로 고쳐진다
// (서버 게이트와 같은 규칙으로 막는다 — lib/descriptionShape). 대본은 빼기·순서만.
// 그 이상은 [고칠 점 적기] → 수정 프롬프트 복사 — 사람은 불만 한 줄, 고치는 건 AI(재촬영 루프와 동일).
// 사이트가 AI에게 무엇을 보내는 게 아니다: 사람이 복사해 AI 채팅창에 붙여넣는다(문구도 그렇게).
export type DraftPatch = Partial<Pick<DBProject, "title" | "description" | "comment" | "demo_script" | "translations">>;

export function DraftReviewModal({ draft, privateReady = true, username, demoPaused = false, published: publishedProp, filmRequested = false, twin = null, onClose, onPublish, onEdit, onDelete, onSave, onSaveInterview }: {
  draft: DBProject;
  // 비공개 칸(대본·로그인 답·로봇 메모)을 서버에서 받았나. 못 받은 동안엔 "대본 없음"이라
  // 거짓으로 보이거나, 빈 값으로 AI 수정 프롬프트를 만들어 AI가 멀쩡한 대본을 덮게 된다.
  privateReady?: boolean;
  /** 주인의 프레임 아이디 — 브라우저 틀 주소 줄과 공개 뒤 [링크 복사]·[명함 보기]. 모르면 주소만 nookframe.com */
  username?: string;
  /** 촬영을 몰아서 하는 중(배치 모드) — 공개 뒤 "촬영 대기 중"의 툴팁이 언제 찍히는지 맞게 말한다 */
  demoPaused?: boolean;
  /** 공개 목록으로 옮겨졌나 — 행의 is_draft가 아니라 ProjectsTab의 목록으로 가른다. realtime은 그 칸을
   *  DB 값으로 덮어써서(공개 직전 저장의 is_draft=true가 늦게 오는 등) 창이 검토 화면으로 깜빡인다 */
  published?: boolean;
  /** 공개하면서 촬영을 요청했고 아직 실패하지 않았다 — DB에 '대기'가 찍히기 전(공개 UPDATE의 realtime이
   *  촬영 상태를 비워 보낸다) 세 단계가 사라졌다 돌아오지 않게 '촬영 대기 중'으로 둔다 */
  filmRequested?: boolean;
  /** 이미 공개된 같은 작품(NF-19) — 공개하면 명함에 둘이 뜬다는 경고 한 줄 */
  twin?: PublishedTwin | null;
  onClose: () => void;
  /** 공개 요청 — 끝날 때까지(성공·실패) 기다린다. 그동안 버튼은 "공개 중…"으로 잠긴다 */
  onPublish: () => Promise<unknown> | void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (patch: DraftPatch) => Promise<void>;
  // 주인 인터뷰 고치기(2026-09-29) — 비공개 칸이라 서버 PATCH를 거친다(ProjectsTab).
  onSaveInterview: (next: OwnerInterview) => Promise<void>;
}) {
  const { t, locale } = useT();
  const uid = useId();
  // 넓은 화면에만 미리보기 칸을 둔다 — 폰에선 폰 자체가 미리보기라 새 탭 링크 한 줄로 충분하다.
  const wide = useMediaQuery("(min-width: 768px)", true);
  const isFile = draft.demo_url.startsWith("/api/preview/");
  // 파일 업로드는 샌드박스 오리진(우리가 frame-ancestors를 쥐고 있어 항상 뜬다).
  // 실행형 코드 zip(비HTML 앵커, 2026-08-20)은 미리보기가 소스 원문이라 임베드 안 함.
  const isEmbeddableFile = isFile && /\.html?$/i.test(draft.demo_url.split(/[?#]/)[0]);
  const fileSrc = isEmbeddableFile ? toPreviewUrl(draft.demo_url) : undefined;
  // 외부 URL은 **그 사이트가 허락해야** 임베드된다 — 아래 embed-check로 물어본다.
  const externalSrc = !isFile && /^https?:\/\//.test(draft.demo_url) ? draft.demo_url : undefined;
  // "작품 열기" 링크는 막혀 있어도 새 탭에서는 열린다 — 판정과 무관하게 준다.
  const previewSrc = fileSrc ?? externalSrc;
  // 제작자가 직접 준 시연 영상: 직링크(mp4/webm)는 <video>, 유튜브·비메오는
  // 플레이어 임베드(전엔 watch 주소를 iframe에 그대로 꽂아 거부 화면이 떴다).
  const videoKind = draft.video_url ? detectVideoKind(draft.video_url) : "unknown";
  const directVideo = videoKind === "direct" ? draft.video_url : undefined;
  const videoEmbed =
    videoKind === "youtube" ? getYouTubeEmbedUrl(draft.video_url)
    : videoKind === "vimeo" ? getVimeoEmbedUrl(draft.video_url)
    : null;
  // 미리보기 틀 — AI가 답한 대상 화면(2026-09-15). 스위치 없음.
  const device = previewDevice(draft.target_device, draft.content_type);
  const deviceAnswered = normalizeTargetDevice(draft.target_device) !== null;

  // ── 외부 URL 임베드 가능 여부 ───────────────────────────────────────────
  // 남의 사이트는 X-Frame-Options·CSP frame-ancestors로 임베드를 막을 수 있고,
  // 그걸 모르고 iframe을 꽂으면 화면엔 브라우저의 "연결을 거부했습니다"만 남는다
  // (2026-09-05 사용자 접수). 그리기 전에 서버에 물어보고, 막혀 있으면 썸네일과
  // 안내로 바꿔 그린다. 업로드 파일·영상 임베드는 물어볼 필요가 없다.
  type EmbedState = "checking" | "ok" | "blocked" | "unreachable";
  // 초기값을 렌더 시점에 계산한다 — effect 안에서 "checking"으로 되돌리면
  // 캐스케이드 렌더가 된다. 모달은 초안마다 새 인스턴스로 열리므로(호출부의
  // key={draft.id}) 이 초기값은 항상 그 초안 기준이다.
  const needsEmbedCheck = !!externalSrc && !directVideo && !videoEmbed && !fileSrc;
  const [embedState, setEmbedState] = useState<EmbedState>(needsEmbedCheck ? "checking" : "ok");

  useEffect(() => {
    if (!needsEmbedCheck) return;
    let cancelled = false;
    fetch("/api/embed-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: externalSrc }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setEmbedState(body?.embeddable ? "ok" : body?.reason === "blocked" ? "blocked" : "unreachable");
      })
      .catch(() => {
        // 확인 자체가 실패하면 일단 그려 본다 — 뜨면 다행이고, 안 뜨면 기존
        // 힌트 문구가 남는다(확인 실패를 사이트 탓으로 몰지 않는다).
        if (!cancelled) setEmbedState("ok");
      });
    return () => { cancelled = true; };
  }, [needsEmbedCheck, externalSrc]);

  // ── 두 언어(2026-09-29) — 명함 구석의 KO/EN으로 기본 언어 판·다른 언어 판을 번갈아 보고 고친다 ──
  // 다른 언어 판은 공개 칸 translations[다른 언어]. 판이 없는 옛 초안은 KO/EN을 그리지 않는다.
  const primaryLoc = normalizeLocale(draft.primary_locale);
  const otherLoc = primaryLoc ? otherLocale(primaryLoc) : null;
  const otherTr = otherLoc ? readTranslations(draft.translations)[otherLoc] : undefined;
  const [cardLang, setCardLang] = useState<"primary" | "other">("primary");
  const onOther = cardLang === "other" && !!otherTr;
  const langToggle = primaryLoc && otherLoc && otherTr ? ([primaryLoc, otherLoc] as const) : null;

  // ── 인라인 편집 ─────────────────────────────────────────────────────────
  type Field = "title" | "description" | "comment";
  // 지금 탭의 글 — 다른 언어 판의 한마디는 builderNote라는 이름으로 들어 있다.
  const fieldValue = (f: Field): string => onOther && otherTr
    ? (f === "title" ? otherTr.title : f === "description" ? otherTr.description : otherTr.builderNote)
    : (f === "title" ? draft.title : f === "description" ? draft.description : draft.comment);
  const [editing, setEditing] = useState<Field | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const begin = (f: Field) => {
    if (saving) return;
    setSaveError(null);
    setValue(fieldValue(f));
    setEditing(f);
  };
  const cancel = () => { setEditing(null); setSaveError(null); };

  // 서버 게이트와 같은 판정 — 여기서 통과한 글은 발행에서도 통과한다.
  const validate = (f: Field, v: string): string | null => {
    const trimmed = v.trim();
    if (f === "title") return trimmed ? null : t.projects.reviewTitleEmpty;
    if (f === "description") {
      if (descriptionTooLong(trimmed)) return t.api.descriptionTooLong(200);
      const issue = descriptionShapeIssue(trimmed);
      if (!issue) return null;
      if (issue.kind === "empty") return t.projects.reviewDescEmpty;
      if (issue.kind === "lines") return t.projects.reviewDescLines(issue.lines);
      return t.projects.reviewDescLongLine(issue.line);
    }
    return null;
  };

  // 저장됐으면(또는 바뀐 게 없으면) true — 공개 버튼이 "고치던 글 먼저 저장"에 쓴다.
  const save = async (): Promise<boolean> => {
    if (!editing) return true;
    const f = editing;
    const trimmed = value.trim();
    const problem = validate(f, trimmed);
    if (problem) { setSaveError(problem); return false; }
    const current = fieldValue(f);
    if (trimmed === current) { cancel(); return true; }
    setSaving(true);
    try {
      if (onOther && otherTr && otherLoc) {
        const key = f === "comment" ? "builderNote" : f;
        const base = draft.translations && typeof draft.translations === "object" ? draft.translations : {};
        await onSave({ translations: { ...base, [otherLoc]: { ...otherTr, [key]: trimmed } } });
      } else {
        await onSave({ [f]: trimmed } as DraftPatch);
      }
      setEditing(null);
      return true;
    } catch {
      setSaveError(t.projects.reviewSaveFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onKey = (e: React.KeyboardEvent, multiline: boolean) => {
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
    if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
  };

  // 소개글 계기판 — 줄 수·가장 긴 줄의 칸 수. 서버 게이트가 보는 숫자 그대로.
  const descLines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const descMaxCols = descLines.length ? Math.max(...descLines.map(lineCols)) : 0;
  const descIssue = editing === "description" ? validate("description", value) : null;

  // ── 대본 살짝 고치기 ────────────────────────────────────────────────────
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptSaving, setScriptSaving] = useState(0);
  const saveScript = async (next: NonNullable<DBProject["demo_script"]>) => {
    setScriptError(null);
    setScriptSaving((n) => n + 1);
    try {
      await onSave({ demo_script: next });
    } catch {
      setScriptError(t.projects.reviewSaveFailed);
    } finally {
      setScriptSaving((n) => n - 1);
    }
  };

  // ── 주인 인터뷰(2026-09-29 사용자 확정: 필수) ─────────────────────────────
  // 답이 있고 주인이 "인터뷰 답이 내 말과 같아요"에 체크해야 공개된다. 비공개 칸을 아직 못 받았으면
  // 답을 볼 수 없으니 공개도 기다린다. 인터뷰 없이 올라온 옛 초안은 AI에게 다시 올려 달라고 한다.
  const interview = privateReady ? readOwnerInterview(draft.owner_interview) : null;
  const [interviewConfirmed, setInterviewConfirmed] = useState(false);
  const canPublish = !!interview && interviewConfirmed;
  // 접힌 것 둘 — 답 목록·촬영 자세히. 하나라도 펼치면(또는 고칠 점을 적는 동안) 명함을 줄인다.
  const [answersOpen, setAnswersOpen] = useState(false);
  const [filmOpen, setFilmOpen] = useState(false);

  // ── 소개 영상(2026-10-02) ─────────────────────────────────────────────────
  // 찍을 화면이 없는 작품은 장면 대본을 그 자리에서 재생한다. 고르기·고치기는 바로 미리보기에 보이고,
  // 잠깐 뒤 서버 검사(초안 PATCH, 쿠키 인증)를 거쳐 저장한다 — 사용자 키로 직접 쓰면 검사를 건너뛴다.
  // 덜어내기(10-02): 입력칸의 판(introDraft)과 미리보기·저장의 판(introShown)을 나눈다 — 글자가 틀린 동안
  // 무대가 하얗게 비지 않고 마지막으로 맞던 판에 머문다. 공개는 기다리던 저장이 끝나야, 틀린 글자가 없어야 된다.
  const initialIntro = draft.intro_film && !introFilmIssue(draft.intro_film) ? draft.intro_film : null;
  const [introDraft, setIntroDraft] = useState<IntroFilm | null>(initialIntro);
  const [introShown, setIntroShown] = useState<IntroFilm | null>(initialIntro);
  const [introSaveFailed, setIntroSaveFailed] = useState(false);
  const introIssue = introDraft ? introFilmIssue(introDraft) : null;
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introPending = useRef<IntroFilm | null>(null);
  const introSaving = useRef<Promise<boolean> | null>(null);
  useEffect(() => () => { if (introTimer.current) clearTimeout(introTimer.current); }, []);
  const saveIntro = (next: IntroFilm): Promise<boolean> => {
    const run = (async () => {
      try {
        const res = await fetch(`/api/ingest/drafts/${encodeURIComponent(draft.id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ introFilm: next }),
        });
        setIntroSaveFailed(!res.ok);
        return res.ok;
      } catch {
        setIntroSaveFailed(true);
        return false;
      }
    })();
    introSaving.current = run;
    void run.finally(() => { if (introSaving.current === run) introSaving.current = null; });
    return run;
  };
  const changeIntro = (next: IntroFilm) => {
    setIntroDraft(next);
    if (introTimer.current) { clearTimeout(introTimer.current); introTimer.current = null; }
    // 틀린 판은 무대에도 서버에도 보내지 않는다 — 칸 밑 한 줄과 접힌 빨간 줄이 말한다.
    if (introFilmIssue(next)) { introPending.current = null; return; }
    setIntroShown(next);
    introPending.current = next;
    introTimer.current = setTimeout(() => {
      introTimer.current = null;
      const pending = introPending.current;
      introPending.current = null;
      if (pending) void saveIntro(pending);
    }, 700);
  };
  // 공개 직전 — 기다리던 저장을 지금 보내고 끝까지 기다린다(전엔 0.7초 안에 공개를 누르면 마지막 글자가
  // 저장 전이었다). 지난 저장이 실패했으면 한 번 더 보낸다. 틀린 글자가 있으면 공개하지 않는다.
  const flushIntro = async (): Promise<boolean> => {
    if (!introDraft || introIssue) return !introIssue;
    if (introTimer.current) { clearTimeout(introTimer.current); introTimer.current = null; }
    const pending = introPending.current;
    introPending.current = null;
    if (pending) return saveIntro(pending);
    if (introSaving.current) return introSaving.current;
    if (introSaveFailed && introShown) return saveIntro(introShown);
    return true;
  };

  // 무대와 장면 목록을 잇는다 — 재생 중인 장면을 목록에 칠하고, 줄을 펼치면 무대가 그 장면에 멈춘다.
  const playerRef = useRef<IntroFilmHandle>(null);
  const introStarts = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const sc of introShown?.scenes ?? []) { out.push(acc); acc += SCENE_SECONDS[sc.kind] ?? 4.6; }
    return out;
  }, [introShown]);
  const [introPlaying, setIntroPlaying] = useState(0);
  const playingRef = useRef(0);
  const barFills = useRef<(HTMLSpanElement | null)[]>([]);
  const onFilmTime = (time: number) => {
    let i = 0;
    for (let k = 0; k < introStarts.length; k++) if (time >= introStarts[k]) i = k;
    if (i !== playingRef.current) { playingRef.current = i; setIntroPlaying(i); }
    introStarts.forEach((s, k) => {
      const el = barFills.current[k];
      const len = SCENE_SECONDS[introShown?.scenes[k]?.kind ?? "hook"] ?? 4.6;
      if (el) el.style.transform = `scaleX(${Math.max(0, Math.min(1, (time - s) / len))})`;
    });
  };
  const [introOpen, setIntroOpen] = useState<number | null>(null);
  const openScene = (i: number | null) => {
    setIntroOpen(i);
    const p = playerRef.current;
    if (i == null) { p?.play(); return; }
    const sc = introShown?.scenes[i];
    // 글자가 다 나와 있는 순간(장면 길이의 55%)에 멈춘다 — 들어오는 움직임이 끝나고 나가기 전.
    p?.pause();
    p?.seek((introStarts[i] ?? 0) + (SCENE_SECONDS[sc?.kind ?? "hook"] ?? 4.6) * 0.55);
  };
  const introIssueScene = issueTarget(introIssue)?.scene ?? 0;

  // 공개 — 글을 고치던 중이면 먼저 저장하고, 저장이 안 되면 공개하지 않는다.
  // 전엔 편집 칸이 열린 채 [공개]를 누르면 고친 내용이 조용히 버려졌다(B9).
  // 창은 공개 뒤에도 열려 있다(업그레이드) — 결과가 올 때까지 버튼을 잠가 두 번 공개되지 않게 한다.
  const [publishing, setPublishing] = useState(false);
  const publish = async () => {
    if (publishing || saving || scriptSaving > 0 || !canPublish || introIssue) return;
    setPublishing(true);
    try {
      if (await save() && await flushIntro()) {
        // 펼쳐 둔 장면이 있으면 접고 무대를 다시 돌린다(공개하면 목록이 사라져 멈춘 채로 남는다).
        if (introOpen != null) openScene(null);
        await onPublish();
      }
    } finally {
      setPublishing(false);
    }
  };
  // 공개됐다 — ProjectsTab이 공개 목록으로 옮긴 같은 행을 넘긴다(실패하면 초안으로 돌아온다).
  const published = publishedProp ?? !draft.is_draft;
  // "공개했어요"로 바뀌는 순간 읽기 초점을 그 제목에 둔다(누른 버튼이 사라지므로).
  const publishedHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (published) publishedHeadingRef.current?.focus();
  }, [published]);
  const [linkCopied, setLinkCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const copyLink = async () => {
    if (!username) return;
    const url = `${window.location.origin}/${encodeURIComponent(username)}`;
    if (await copyText(url)) {
      setManualLink(null);
      setLinkCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setLinkCopied(false), 1600);
    } else {
      // 복사가 막힌 곳(인앱 브라우저 등) — "복사했어요"라고 거짓말하지 않고 주소를 펼친다.
      setManualLink(url);
    }
  };

  // ── 고칠 점 적기 → 수정 프롬프트 복사 ─────────────────────────────────────
  // 판단 칸이 통째로 "무엇을 고칠까요?" 한 가지 일로 바뀐다(버튼 줄도 [닫기] [수정 프롬프트 복사]).
  // 복사한 뒤엔 "복사했어요" + [닫기]. 사이트는 AI에게 아무것도 보내지 않는다 — 사람이 붙여넣는다.
  const [mode, setMode] = useState<"review" | "fix" | "copied">("review");
  const [fixNote, setFixNote] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const [fixFailed, setFixFailed] = useState(false);
  // 클립보드가 막힌 브라우저(사파리 등) — 받은 프롬프트를 직접 복사 칸에 펼친다(연결 창과 같은 출구).
  const [manualFix, setManualFix] = useState<string | null>(null);
  // 패널이 열리는 순간 한 번만 보이는 곳으로 끌어온다(안정된 ref 콜백 = 마운트 때만 호출).
  const revealFix = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const openFix = () => { setMode("fix"); setFixFailed(false); setManualFix(null); };
  const closeFix = () => { setMode("review"); setFixFailed(false); setManualFix(null); };
  const copyFix = () => {
    if (!fixNote.trim() || fixBusy || !privateReady) return;
    setFixBusy(true);
    setFixFailed(false);
    setManualFix(null);
    let prompt = "";
    // 연결 패널과 같은 규약: 프롬프트에 박히는 것은 1회용 페어링 코드뿐이다
    // (이 프롬프트도 AI 채팅창에 붙여넣는 물건이라 토큰을 실으면 기록에 남는다).
    // 복사는 코드 발급(fetch)보다 **먼저** 시작해야 사파리가 허락한다(copyTextLater) — 앞에 await를 두지 말 것.
    const ready = fetch("/api/connect/code", { method: "POST" }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.code !== "string") throw new Error("code");
      prompt = buildDraftFixPrompt({
        projectId: draft.id,
        title: draft.title,
        description: draft.description,
        builderNote: draft.comment,
        demoHighlights: draft.demo_user_hint,
        tags: draft.tags ?? [],
        contentType: draft.content_type,
        targetDevice: draft.target_device ?? null,
        deployUrl: isFile ? null : draft.demo_url,
        demoScript: draft.demo_script,
        demoAccess: draft.demo_access,
        ownerInterview: interview,
        language: draft.primary_locale ?? null,
        appLanguages: draft.app_locales ?? null,
        translations: draft.translations,
        note: fixNote.trim(),
        code: body.code,
        origin: window.location.origin,
      }, locale);
      return prompt;
    });
    copyTextLater(ready)
      .then((ok) => { if (ok) setMode("copied"); else setManualFix(prompt); })
      .catch(() => setFixFailed(true))
      .finally(() => setFixBusy(false));
  };

  // ── ⋯ 메뉴(직접 고치기·삭제하기) ────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  // ── 스크롤 가장자리 신호: 머리 아래 선 · 버튼 위 흐림(아래에 더 있음) ──────
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ scrolled: false, atEnd: true });
  const measureEdges = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const scrolled = el.scrollTop > 2;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setEdges((p) => (p.scrolled === scrolled && p.atEnd === atEnd ? p : { scrolled, atEnd }));
  }, []);
  useEffect(() => {
    const ro = new ResizeObserver(measureEdges);
    if (bodyRef.current) ro.observe(bodyRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [measureEdges]);

  // ── 촬영 한 줄 ─────────────────────────────────────────────────────────
  const steps = draft.demo_script?.steps ?? [];
  const wired = steps.filter(isStepWired).length;
  const hasOwnVideo = !!draft.video_url;
  // 공개하면 촬영을 요청하나 — 공개 처리(ProjectsTab.handlePublishDraft)와 같은 판정. 버튼 이름이 결과를 말한다.
  // 소개 영상은 촬영하지 않는다(명함이 대본을 재생).
  const films = !hasOwnVideo && !introShown && !!detectDemoSource(draft.demo_url);
  const introSec = introShown ? Math.round(introSeconds(introShown)) : 0;
  // 미리보기에 보이는 언어 — 방문자 틀의 KO/EN과 같이 움직인다.
  const viewLoc: "en" | "ko" = (onOther && otherLoc ? otherLoc : primaryLoc ?? locale) === "en" ? "en" : "ko";
  const access = draft.demo_access;
  // 비공개 칸을 아직 못 받았으면 "로그인 답 없음" 경고는 거짓이다 — 중립 자리표시만.
  const accessLine = !privateReady
    ? { text: "…", note: undefined, warn: false }
    : access?.url
    ? { text: `${t.projects.reviewAccessUrl} · ${access.url}`, note: access.note, warn: false }
    : access?.noLogin
      ? { text: t.projects.reviewAccessNoLogin, note: access.note, warn: false }
      : access?.impossible
        ? { text: t.projects.reviewAccessImpossible, note: access.note, warn: true }
        : { text: t.projects.reviewAccessMissing, note: undefined, warn: true };
  const accessText = [accessLine.text, accessLine.note].filter(Boolean).join(" · ");
  // "촬영: 4장면 · 약 5초 · 영어 자막 포함" — 자막은 앱 화면이 못 보여주는 언어(filmPlan, 워커와 같은 판정).
  const appLocs = normalizeAppLanguages(draft.app_locales);
  const plan = primaryLoc && appLocs ? filmPlan(primaryLoc, appLocs) : null;
  const filmTail = !plan
    ? null
    : plan.captions.length
      ? t.projects.reviewFilmCaptions(plan.captions.map((l) => t.projects.langNames[l]))
      : plan.extra ? t.projects.reviewFilmAlso(t.projects.langNames[plan.extra]) : null;
  const filmSeconds = Math.max(1, Math.round(steps.reduce((sum, s) => sum + holdOf(s), 0)));
  const filmLine = introShown
    ? `${t.projects.reviewIntroLabel}: ${t.projects.reviewFilmScenes(introShown.scenes.length)} · ${t.projects.reviewFilmAbout(introSec)}`
    : `${t.projects.reviewFilmLabel}: ${
    hasOwnVideo
      ? t.projects.reviewVideoOwn
      : !privateReady
        ? "…"
        : [t.projects.reviewFilmScenes(steps.length), steps.length ? t.projects.reviewFilmAbout(filmSeconds) : null, filmTail]
          .filter(Boolean).join(" · ")
  }`;
  // 늘 보이는 문제 줄 — 접혀 있어도 빨갛게(짧지만 정확하게). 정상이면 아무 말도 안 한다.
  // 소개 영상은 틀린 글자(공개가 막힌 까닭)와 저장 실패만.
  const filmWarnings = introShown
    ? [...(introIssue ? [t.projects.reviewIntroFixScene(introIssueScene + 1)] : []), ...(introSaveFailed ? [t.projects.reviewIntroSaveFailed] : [])]
    : hasOwnVideo || !privateReady ? [] : [
    ...(steps.length && wired < steps.length ? [t.projects.reviewShootPartWired(wired, steps.length)] : []),
    ...(accessLine.warn ? [`${t.projects.reviewVerdictAccess}: ${accessText}`] : []),
  ];
  // 펼친 촬영 칸의 작은 표 첫 줄 — 로그인 방법(문제일 땐 위 빨간 줄이 이미 말하므로 뺀다).
  const loginRow: DetailRow[] = hasOwnVideo || !privateReady || accessLine.warn
    ? []
    : [{ label: t.projects.reviewVerdictAccess, value: accessText }];
  const opensKind: "file" | "repo" | "url" = isFile
    ? "file"
    : /github\.com\//i.test(draft.demo_url) ? "repo" : "url";
  const opensLabel = opensKind === "file"
    ? t.projects.reviewOpensFile
    : opensKind === "repo"
      ? draft.demo_url.replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      : draft.demo_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const title = draft.title || t.projects.untitled;

  // ── 업그레이드: 브라우저 틀 주소 · 무대 띠 왼쪽 위 표시 · 버튼 위 세 단계 ─────────
  const frameAddress = username ? `nookframe.com/${username}` : "nookframe.com";
  // 미리보기 안의 작은 말(무대 띠 표시 · 말풍선 이름표)은 보이는 판의 언어로(방문자가 보는 그대로) —
  // KO/EN을 바꾸면 그 언어로 바뀐다. '공개했어요'의 작은 프레임은 기본 언어 판이라 기본 언어로.
  const primaryDict = getDictionary(primaryLoc ?? locale);
  const cardDict = onOther && otherLoc ? getDictionary(otherLoc) : primaryDict;
  // 자동 시연이면 위 촬영 줄과 같은 "약 N초", 직접 준 영상이면 숫자 없이 지금 쓰는 말 그대로.
  // 대본을 아직 못 받았거나 장면이 없으면 숫자를 지어내지 않고 표시를 두지 않는다.
  const chipText = introShown
    ? cardDict.projects.reviewIntroChip(introSec)
    : hasOwnVideo
    ? capitalize(cardDict.projects.reviewVideoOwn)
    : films && privateReady && steps.length ? cardDict.projects.reviewAutoDemo(filmSeconds) : null;
  // 이름표의 흐린 한 줄 — 공개 페이지와 같은 "AI 도구 · 연도"(옛 도구 칩 자리). 도구 이름은 두 언어 공통.
  const cardMeta = [...(draft.tags ?? []), draft.year].filter(Boolean).join(" · ");
  // 세 단계 — 공개해도 찍을 게 없으면(직접 준 영상·찍을 수 없는 주소) 두지 않는다. 버튼 이름과 같은 판정(films).
  const reviewTrail: TrailStep[] | null = films ? [
    { state: "cur", label: t.projects.reviewTrailPublish },
    { state: "todo", label: t.projects.reviewTrailFilm },
    { state: "todo", label: t.projects.reviewTrailCard },
  ] : null;
  // 공개한 뒤엔 촬영 상태(실시간으로 바뀐다)를 그대로 따른다. 촬영이 안 걸렸으면(직접 준 영상·요청 실패) 두지 않는다 —
  // 실패는 목록의 토스트·행 배지가 말한다.
  const status = draft.demo_build_status ?? (published && filmRequested ? "pending" : null);
  const filmStep: TrailStep | null =
    status === "pending" || status === "held"
      ? { state: "wait", label: t.projects.reviewTrailWaiting, title: demoPaused ? t.projects.pausedTip : t.projects.progressRunningBody }
      : status === "building" || status === "recording" || status === "editing"
        ? { state: "wait", label: t.projects.reviewTrailFilming, title: t.projects.progressRunningBody }
        : status === "done" ? { state: "done", label: t.projects.reviewTrailFilm } : null;
  const publishedTrail: TrailStep[] | null = filmStep ? [
    { state: "done", label: t.projects.reviewTrailPublish },
    filmStep,
    { state: status === "done" ? "done" : "todo", label: t.projects.reviewTrailCard },
  ] : null;
  const trail = published ? publishedTrail : mode === "review" ? reviewTrail : null;

  // ── 스타일 ─────────────────────────────────────────────────────────────
  // 방문자 미리보기는 새 프레임 페이지처럼 이름표 글이 페이지 바탕(테마 변수) 위에 있다 — 늘 어두운 건
  // 무대 띠(MiniStage)뿐. 그 자리 고치기 칸·버튼도 밝은 바탕의 기본 모양(.vf-input·.vf-button-*)을 작게 쓴다.
  const editableStyle: React.CSSProperties = { cursor: "text", borderRadius: 6, transition: "background 0.15s" };
  const editInput: React.CSSProperties = { padding: "5px 9px", borderRadius: 8 };
  const editButton: React.CSSProperties = { padding: "5px 14px", fontSize: "0.8rem" };
  const smallText: React.CSSProperties = {
    margin: 0, fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)",
  };
  // 답·촬영을 펼치거나 고칠 점을 적는 동안엔 미리보기를 한 단계 줄여 아래 내용에 자리를 준다.
  const compactCard = answersOpen || filmOpen || mode !== "review";
  const cardTitleSize = compactCard ? "1.3rem" : "1.45rem";
  const textLink: React.CSSProperties = { flexShrink: 0, textDecoration: "underline", textUnderlineOffset: 3 };
  const footButton: React.CSSProperties = { fontSize: "0.9375rem", padding: "0.72rem 1.4rem" };
  // 틀 안의 글자는 틀째 축소되므로(폰 ~0.8·PC ~0.6배) 크게 쓴다.
  const frameText: React.CSSProperties = {
    margin: 0, padding: "0 32px", textAlign: "center", fontFamily: "var(--font-nunito)",
    fontSize: device === "mobile" ? 20 : 26, lineHeight: 1.5, color: "var(--text-muted)",
  };

  // ── 미리보기 틀 안 ──────────────────────────────────────────────────────
  const frame = directVideo ? (
    <video src={directVideo} controls playsInline className="absolute inset-0 w-full h-full"
      style={{ objectFit: "contain", background: "#000" }} />
  ) : videoEmbed ? (
    <iframe src={videoEmbed} title={title} className="absolute inset-0 w-full h-full"
      style={{ border: "none", background: "#000" }}
      allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
  ) : fileSrc ? (
    <iframe src={fileSrc} title={title} className="absolute inset-0 w-full h-full"
      style={{ border: "none", background: "#fff" }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
  ) : externalSrc && embedState === "checking" ? (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <span className="vf-spinner" style={{ width: "2.4rem", height: "2.4rem" }} />
      <p style={frameText}>{t.projects.reviewEmbedChecking}</p>
    </div>
  ) : externalSrc && embedState === "ok" ? (
    <iframe src={externalSrc} title={title} className="absolute inset-0 w-full h-full"
      style={{ border: "none", background: "#fff" }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
  ) : draft.thumbnail ? (
    <Image src={draft.thumbnail} unoptimized alt={title} fill className="object-cover object-top" sizes="480px" />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center">
      <p style={frameText}>{t.projects.reviewNoPreview}</p>
    </div>
  );

  const deviceGlyph = device === "mobile" ? <PhoneGlyph /> : <LaptopGlyph />;

  // 두 언어(2026-09-29) — 보는 사람 언어마다 명함이 이렇게 뜬다. 업그레이드부터 브라우저 틀 주소 줄 끝의 작은 KO/EN.
  const langSwitch = langToggle && (
    <div role="tablist" aria-label={t.projects.reviewLangTitle} className="flex" style={{ padding: 2, borderRadius: 999, background: "var(--surface-soft)" }}>
      {(["primary", "other"] as const).map((k, i) => {
        const loc = langToggle[i];
        const active = cardLang === k;
        return (
          <button
            key={k} type="button" role="tab" aria-selected={active} aria-label={t.projects.langNames[loc]}
            onClick={() => { if (editing) cancel(); setCardLang(k); }}
            style={{
              padding: "1px 8px", border: "none", borderRadius: 999, cursor: "pointer",
              fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 600, lineHeight: 1.5,
              background: active ? "var(--text-primary)" : "transparent", color: active ? "var(--bg)" : "var(--text-secondary)",
            }}
          >
            {loc.toUpperCase()}
          </button>
        );
      })}
    </div>
  );

  // 그 자리 고치기의 [저장] [닫기] + 저장 실패 — 고치는 칸 가까이에(제목·소개글은 글 칸 끝, 한마디는 그 칸 밑).
  const editRow = editing && (
    <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
      <button type="button" onClick={() => void save()} disabled={saving || !!descIssue}
        className="vf-button-primary" style={editButton}>
        {t.projects.reviewEditSave}
      </button>
      <button type="button" onClick={cancel} disabled={saving} className="vf-button-ghost" style={editButton}>
        {t.projects.reviewEditCancel}
      </button>
      {saveError && editing !== "description" && (
        <span className="text-xs" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{saveError}</span>
      )}
      {saveError && editing === "description" && !descIssue && (
        <span className="text-xs" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{saveError}</span>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="vf-review"
        data-device={device}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        style={{ width: "min(1360px, 100%)", height: "min(880px, 100%)" }}
      >
        {/* ── 왼쪽: 미리보기(AI가 답한 화면) ── */}
        {wide && introShown && (
          // 소개 영상(덜어내기 10-02) — 앱 화면 틀(PC/폰 표시·크기 숫자) 대신 방문자가 PC 프레임에서 볼 무대 그대로:
          // 16:10 · 잘라 채우기 · 왼쪽 위 "소개 영상". 바닥의 장면 막대는 진짜 재생 위치이고, 칸을 누르면 그 장면으로 간다.
          <aside className="vf-review-preview" aria-label={t.projects.reviewPreviewLabel}>
            <div className="flex items-center justify-end gap-3" style={{ minHeight: 34 }}>
              {previewSrc && (
                <a href={previewSrc} target="_blank" rel="noopener noreferrer" className="vf-review-link">
                  {t.projects.menuOpen}
                </a>
              )}
            </div>
            <div className="vf-review-stage">
              <div style={{ position: "relative", width: "100%", maxHeight: "100%", aspectRatio: "16 / 10", borderRadius: 14, overflow: "hidden", background: "#0a0a0a" }}>
                <div className="absolute inset-0">
                  <IntroFilmPlayer ref={playerRef} film={introShown} locale={viewLoc} title={title} fit="cover" onTime={onFilmTime} />
                </div>
                <StageChip label={cardDict.theater.chipIntroFilm} inset={16} />
                {/* 바닥 줄은 프레임 무대의 재생 막대(StageProgress)와 같은 색·두께를 장면마다 끊어 그린다.
                    움직임 줄이기에서도 둔다 — 꾸밈이 아니라 장면으로 가는 길이다. */}
                <div className="absolute flex" style={{ left: 0, right: 0, bottom: 0, gap: 3, zIndex: 5 }}>
                  {introShown.scenes.map((sc, k) => (
                    <button
                      key={k} type="button" aria-label={t.projects.reviewIntroScene(k + 1, t.projects.reviewIntroKinds[sc.kind])}
                      onClick={() => (introOpen != null ? openScene(k) : playerRef.current?.seek(introStarts[k] ?? 0))}
                      style={{ flex: `${SCENE_SECONDS[sc.kind] ?? 4.6} 1 0`, height: 14, padding: "11px 0 0", border: "none", background: "transparent", cursor: "pointer" }}
                    >
                      <span style={{ display: "block", height: 3, background: "linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0.16)), rgba(0,0,0,0.28)" }}>
                        <span ref={(el) => { barFills.current[k] = el; }}
                          style={{ display: "block", height: "100%", background: "#f4ede0", transformOrigin: "left center", transform: "scaleX(0)" }} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
        {wide && !introShown && (
          <aside className="vf-review-preview" aria-label={t.projects.reviewPreviewLabel}>
            <div className="flex items-center justify-between gap-3" style={{ minHeight: 34 }}>
              <span className="vf-review-badge">
                {deviceGlyph}
                {device === "mobile" ? t.projects.reviewDeviceMobile : t.projects.reviewDeviceDesktop}
                <small>· {deviceAnswered ? t.projects.reviewDeviceAnswered : t.projects.reviewDeviceGuessed}</small>
              </span>
              {previewSrc && (
                <a href={previewSrc} target="_blank" rel="noopener noreferrer" className="vf-review-link">
                  {t.projects.menuOpen}
                </a>
              )}
            </div>
            <PreviewDevice device={device} address={opensLabel}>{frame}</PreviewDevice>
            <p className="vf-mono" style={{ ...smallText, fontSize: 12, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
              {device === "mobile" ? `${PHONE_VIEW.w} × ${PHONE_VIEW.h}` : `${DESKTOP_VIEW.w} × ${DESKTOP_VIEW.h}`}
            </p>
            {/* 배포 주소 없이 파일(실행 코드 묶음)로 올린 작품은 라이브 체험 칸이 안
                켜진다 — 공개 뒤 "왜 영상만 있지?"가 되지 않게 미리 말해 둔다. */}
            {isFile && !isEmbeddableFile && (
              <p style={{ ...smallText, fontSize: 12.5 }}>{t.projects.reviewNoLiveNote}</p>
            )}
            {externalSrc && !directVideo && !videoEmbed && embedState !== "checking" && (
              <p style={{ ...smallText, fontSize: 12.5 }}>
                {embedState === "blocked"
                  ? t.projects.reviewEmbedBlocked
                  : embedState === "unreachable"
                    ? t.projects.reviewEmbedUnreachable
                    : t.projects.reviewEmbedTip}
              </p>
            )}
          </aside>
        )}

        {/* ── 오른쪽: 판단 ── */}
        <section className="vf-review-main">
          <header className="vf-review-head" data-scrolled={edges.scrolled ? "true" : "false"}>
            {/* 제목과 배지를 한 줄에(업그레이드 — 틀과 세 단계가 들어갈 자리를 만든다). 좁으면 배지가 밑으로 접힌다 */}
            <div className="flex items-center gap-3" style={{ minHeight: 36 }}>
              <div className="flex flex-wrap items-center" style={{ flex: 1, minWidth: 0, gap: "4px 10px" }}>
                {!published && (
                  <h2
                    id={`${uid}-title`}
                    style={{
                      margin: 0, fontFamily: "var(--font-nunito)", fontSize: "clamp(1.3rem, 2.1vw, 1.6rem)",
                      fontWeight: 700, lineHeight: 1.35, letterSpacing: "-0.02em", color: "var(--text-primary)",
                      wordBreak: "keep-all", overflowWrap: "anywhere",
                    }}
                  >
                    {t.projects.reviewAsk}
                  </h2>
                )}
                {/* 누가 보는지는 늘 보인다 — 공개 전 "나만", 공개 뒤 "누구나"(진한 배지) */}
                <span
                  className="rounded-full"
                  style={{
                    padding: "4px 10px", fontFamily: "var(--font-nunito)", fontSize: "0.72rem", fontWeight: 600,
                    background: published ? "var(--text-primary)" : "var(--surface-soft)",
                    color: published ? "var(--bg)" : "var(--text-secondary)",
                  }}
                >
                  {published ? t.projects.reviewPublishedBadge : t.projects.draftBadge}
                </span>
              </div>
              <div ref={menuRef} className="relative flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                {!published && (
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="vf-icon-button"
                  style={{
                    width: 34, height: 34, color: "var(--text-primary)",
                    background: menuOpen ? "var(--surface-soft-hover)" : undefined,
                  }}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t.projects.more}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <circle cx="3.5" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="12.5" cy="8" r="1.4" />
                  </svg>
                </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="vf-icon-button"
                  style={{ width: 34, height: 34, color: "var(--text-primary)" }}
                  aria-label={t.projectForm.closeAria}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
                {menuOpen && !published && (
                  <div
                    role="menu"
                    className="absolute right-0 flex flex-col"
                    style={{
                      top: 42, zIndex: 10, minWidth: 168, padding: 6, borderRadius: 14,
                      background: "var(--surface)", boxShadow: "var(--shadow-card-small)",
                    }}
                  >
                    <button type="button" role="menuitem" className="vf-review-menu-item"
                      onClick={() => { setMenuOpen(false); onEdit(); }}>
                      {t.projects.reviewMenuEdit}
                    </button>
                    <button type="button" role="menuitem" className="vf-review-menu-item" data-danger="true"
                      onClick={() => { setMenuOpen(false); onDelete(); }}>
                      {t.projects.reviewMenuDelete}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* 아래 여백을 줄여(36→16) 틀·세 단계가 들어와도 펼친 답까지 한 화면에 든다. 끝까지 내리면 흐림은 사라진다 */}
          <div ref={bodyRef} className="vf-review-body" onScroll={measureEdges} style={{ paddingBottom: 16 }}>
            <div
              ref={contentRef} className="vf-review-content"
              // 공개한 뒤엔 체크·작은 명함을 칸 한가운데에
              style={published ? { gap: 12, minHeight: "100%", justifyContent: "center" } : { gap: 12 }}
            >
              {!wide && previewSrc && !published && (
                <a
                  href={previewSrc} target="_blank" rel="noopener noreferrer"
                  className="vf-review-start" style={{ marginBottom: 0, color: "var(--text-primary)", textDecoration: "none" }}
                >
                  <span className="vf-review-start-icon" aria-hidden>{deviceGlyph}</span>
                  <span style={{ fontFamily: "var(--font-nunito)", fontSize: "0.95rem", fontWeight: 600 }}>
                    {t.projects.reviewOpenWork}
                  </span>
                </a>
              )}

              {/* ① 방문자가 볼 모습 — 프레임 페이지를 작게(브라우저 틀 안, 주소 줄 끝에 KO/EN): 어두운 무대 띠 +
                  페이지 바탕의 이름표. 제목·소개글·한마디는 글자를 누르면 그 자리에서 고친다 */}
              {!published && (
              <div className="flex flex-col" style={{ gap: 8 }}>
                <VisitorFrame address={frameAddress} right={langSwitch} tight={compactCard}>
                <div style={{ padding: compactCard ? "2px 2px 6px" : "4px 4px 10px" }}>
                  <MiniStage height={compactCard ? 52 : 64} label={chipText} />

                  {/* 이름표 — 왼쪽 글 칸(제목·소개글·흐린 한 줄), 한마디 말풍선은 그 오른쪽. 칸이 좁으면 공개 페이지처럼
                      말풍선이 글 밑 오른쪽으로 내려간다. 한마디를 고치는 칸은 한 줄을 통째로 쓴다 */}
                  <div className="flex flex-wrap items-start" style={{ columnGap: 20, rowGap: compactCard ? 8 : 10, marginTop: compactCard ? 10 : 12 }}>
                    <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                      {editing === "title" ? (
                        <input ref={inputRef as React.RefObject<HTMLInputElement>} value={value} onChange={e => setValue(e.target.value)}
                          onKeyDown={e => onKey(e, false)} disabled={saving}
                          className="vf-input vf-serif-display" style={{ ...editInput, fontSize: cardTitleSize, fontWeight: 600, lineHeight: 1.25 }} />
                      ) : (
                        // 2줄에서 자르는 글이라 세로 여백은 두지 않는다(여백에 셋째 줄 윗부분이 비친다)
                        <h3 className="vf-serif-display" onClick={() => begin("title")} title={t.projects.reviewEditHint}
                          style={{
                            ...captionText.title(cardTitleSize), ...editableStyle, padding: "0 4px", marginLeft: -4,
                            color: fieldValue("title") ? undefined : "var(--text-muted)",
                          }}>
                          {fieldValue("title") || t.projects.untitled}
                        </h3>
                      )}

                      {editing === "description" ? (
                        <div style={{ marginTop: 6 }}>
                          <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={value} onChange={e => setValue(e.target.value)}
                            onKeyDown={e => onKey(e, true)} rows={3} disabled={saving}
                            className="vf-input" style={{ ...editInput, lineHeight: 1.55, resize: "vertical" }} />
                          <p className="text-xs" style={{ margin: "4px 0 0", fontFamily: "var(--font-nunito)", color: descIssue ? "var(--danger)" : "var(--text-muted)" }}>
                            {descIssue ?? t.projects.reviewDescMeter(descLines.length, descMaxCols, DESCRIPTION_LINE_COLS_MAX)}
                          </p>
                        </div>
                      ) : (
                        // 소개글은 2~3줄로 끊어 쓴 카피지만 프레임 이름표처럼 줄바꿈을 풀어 흘린다(줄을 살린 전문은 작품 페이지)
                        <p onClick={() => begin("description")} title={t.projects.reviewEditHint}
                          style={{
                            ...captionText.description(compactCard ? 13 : 14), ...editableStyle, marginTop: 4, padding: "0 4px", marginLeft: -4,
                            color: fieldValue("description") ? "var(--text-secondary)" : "var(--text-muted)",
                          }}>
                          {fieldValue("description") || t.projects.reviewDescEmpty}
                        </p>
                      )}

                      {cardMeta && <p style={{ ...captionText.meta(compactCard ? 12 : 13), marginTop: compactCard ? 4 : 6 }}>{cardMeta}</p>}
                      {editing !== "comment" && editRow}
                    </div>

                    {editing === "comment" ? (
                      <div style={{ flex: "1 1 100%", minWidth: 0 }}>
                        <input ref={inputRef as React.RefObject<HTMLInputElement>} value={value} onChange={e => setValue(e.target.value)}
                          onKeyDown={e => onKey(e, false)} disabled={saving} placeholder={t.projects.reviewNotePlaceholder}
                          className="vf-input" style={editInput} />
                        {editRow}
                      </div>
                    ) : (
                      <NoteBubble label={cardDict.theater.makerNote} size={compactCard ? "sm" : "md"} muted={!fieldValue("comment")}
                        onClick={() => begin("comment")} title={t.projects.reviewEditHint}
                        style={{ flex: "none", marginLeft: "auto", cursor: "text" }}>
                        {fieldValue("comment") || t.projects.reviewNotePlaceholder}
                      </NoteBubble>
                    )}
                  </div>
                </div>
                </VisitorFrame>
                {/* 다른 언어 판이 빠진 초안 — 방문자 절반이 빈 명함을 보게 되니 늘 보이게 */}
                {primaryLoc && otherLoc && !otherTr && (
                  <p style={{ ...smallText, padding: "0 4px", color: "var(--danger)" }}>
                    {t.projects.reviewLangMissingTr(t.projects.langNames[otherLoc])}
                  </p>
                )}
              </div>
              )}

              {/* 검토 칸들은 [고칠 점 적기]로 바꿔도 **숨기기만** 한다 — 내리면(unmount) 고치던 답·자막이
                  말없이 사라졌다(10-01 검토). 돌아오면 하던 그대로다(공개가 실패해 돌아올 때도). */}
              <div className="flex flex-col" style={{ gap: 12 }} hidden={mode !== "review" || published}>
                  {twin && (
                    <p role="note" style={{ ...smallText, padding: "0 4px", color: "var(--danger)" }}>
                      {t.projects.reviewPublishedTwin(twin.title, twin.by === "url")}
                    </p>
                  )}
                  {/* ② 주인 인터뷰 확인 — 체크해야 공개된다(2026-09-29, 필수) */}
                  <OwnerInterviewPanel
                    interview={interview}
                    loading={!privateReady}
                    confirmed={interviewConfirmed}
                    onConfirmChange={setInterviewConfirmed}
                    open={answersOpen}
                    onOpenChange={setAnswersOpen}
                    onSave={onSaveInterview}
                    listId={`${uid}-answers`}
                  />

                  {/* ③ 촬영 한 줄 — [보기]로 장면 막대·자막·언어/로그인 */}
                  <div className="flex flex-col" style={{ gap: 6 }}>
                    <div className="flex items-center justify-between" style={{ gap: 12, padding: "2px 4px" }}>
                      <p style={{ margin: 0, minWidth: 0, fontFamily: "var(--font-nunito)", fontSize: 15, lineHeight: 1.5, color: "var(--text-primary)" }}>
                        {filmLine}
                      </p>
                      <button
                        type="button" onClick={() => setFilmOpen((v) => !v)}
                        aria-expanded={filmOpen} aria-controls={`${uid}-film`}
                        className="vf-button-text" style={textLink}
                      >
                        {filmOpen ? t.projects.reviewFold : t.projects.reviewShow}
                      </button>
                    </div>
                    {filmWarnings.map((w) => (
                      <p key={w} style={{ ...smallText, padding: "0 4px", color: "var(--danger)" }}>{w}</p>
                    ))}
                    {filmOpen && (
                      <div id={`${uid}-film`} className="flex flex-col" style={{ gap: 10, marginTop: 4 }}>
                        {introDraft ? (
                          <IntroFilmPanel film={introDraft} locale={viewLoc} playing={introPlaying} open={introOpen}
                            issue={introIssue} onOpen={openScene} onChange={changeIntro} />
                        ) : (<>
                        {!hasOwnVideo && (
                          <DemoScriptPanel script={draft.demo_script} loading={!privateReady} onChange={saveScript} compact />
                        )}
                        {scriptError && <p style={{ ...smallText, color: "var(--danger)" }}>{scriptError}</p>}
                        <LanguagePanel
                          primary={draft.primary_locale}
                          app={draft.app_locales}
                          script={privateReady ? draft.demo_script : null}
                          scriptLoading={!privateReady}
                          hasOwnVideo={hasOwnVideo}
                          lead={loginRow}
                          onSaveScript={async (next) => { await onSave({ demo_script: next }); }}
                        />
                        </>)}
                      </div>
                    )}
                  </div>
              </div>
              {published ? (
                // 공개했어요 — 큰 체크 · 방문자가 볼 작은 프레임(무대 띠 + 이름표, 기본 언어 판). 다음에 무슨 일이
                // 일어나는지는 버튼 위 세 단계가 말한다
                <div className="vf-step-enter flex flex-col items-center text-center" style={{ gap: 14 }}>
                  <PublishedMark />
                  <h2
                    id={`${uid}-title`} ref={publishedHeadingRef} tabIndex={-1}
                    className="vf-serif-display" style={{ margin: "6px 0 0", fontSize: "1.625rem", fontWeight: 600, lineHeight: 1.3, outline: "none" }}
                  >
                    {t.projects.reviewPublishedTitle}
                  </h2>
                  <div style={{ width: "min(360px, 100%)", textAlign: "left" }}>
                    <VisitorFrame address={frameAddress} tight center>
                      <div style={{ padding: "2px 2px 8px" }}>
                        <MiniWork title={draft.title} untitled={t.projects.untitled} description={draft.description}
                          meta={cardMeta} note={draft.comment} noteLabel={primaryDict.theater.makerNote} />
                      </div>
                    </VisitorFrame>
                  </div>
                  {manualLink && (
                    <div style={{ width: "min(360px, 100%)" }}><ManualCopyBox text={manualLink} rows={1} /></div>
                  )}
                </div>
              ) : mode === "fix" ? (
                // 고칠 점 적기 — 이 창의 일이 "무엇을 고칠까요?" 하나로 바뀐다
                <div ref={revealFix} className="rounded-2xl flex flex-col" style={{ gap: 12, padding: 18, background: "var(--surface-soft)" }}>
                  <label htmlFor={`${uid}-fix`} style={{ fontFamily: "var(--font-nunito)", fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: "var(--text-primary)" }}>
                    {t.projects.reviewFixLead}
                  </label>
                  <textarea
                    id={`${uid}-fix`} autoFocus value={fixNote}
                    onChange={e => { setFixNote(e.target.value); setFixFailed(false); setManualFix(null); }}
                    rows={4} placeholder={t.projects.reviewFixPlaceholder} className="vf-input w-full"
                    style={{ fontSize: 15, lineHeight: 1.6, background: "var(--surface)", resize: "vertical" }}
                  />
                  {fixFailed && <p style={{ ...smallText, fontSize: 14, color: "var(--danger)" }}>{t.projects.reviewFixFailed}</p>}
                  {manualFix && <ManualCopyBox text={manualFix} />}
                </div>
              ) : mode === "copied" ? (
                <div role="status" className="rounded-2xl" style={{ padding: 18, background: "var(--surface-soft)" }}>
                  <p style={{ margin: 0, fontFamily: "var(--font-nunito)", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                    <span aria-hidden>✓ </span>{t.projects.reviewFixCopied}
                  </p>
                  <p style={{ ...smallText, fontSize: 14, marginTop: 6 }}>{t.projects.reviewFixCopiedBody}</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* 아래 버튼 줄 — 가운데 모아서. 안내 문장 없이 버튼 이름이 결과를 말한다.
              검토·공개 뒤엔 버튼 바로 위에 작은 세 단계(고칠 점을 적는 동안엔 없다) */}
          <footer
            className="vf-review-foot" data-at-end={edges.atEnd ? "true" : "false"}
            style={{ flexDirection: "column", justifyContent: "center", gap: 12, ...(trail ? { paddingTop: 12, paddingBottom: 16 } : null) }}
          >
            {trail && <PublishTrail steps={trail} />}
            <div className="flex flex-wrap items-center justify-center" style={{ gap: "8px 12px" }}>
            {published ? (
              username ? (
                <>
                  <button type="button" onClick={() => void copyLink()} className="vf-button-ghost" style={footButton}>
                    {linkCopied ? t.projects.reviewLinkCopied : t.projects.reviewCopyLink}
                  </button>
                  <a
                    href={`/${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer"
                    className="vf-button-primary" style={footButton}
                  >
                    {t.projects.reviewViewCard}
                    <svg width="11" height="11" viewBox="0 0 13 13" fill="none" aria-hidden>
                      <path d="M1.5 11.5L11.5 1.5M11.5 1.5H5.5M11.5 1.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </>
              ) : (
                <button type="button" onClick={onClose} className="vf-button-primary" style={footButton}>
                  {t.projects.reviewClose}
                </button>
              )
            ) : mode === "review" ? (
              <>
                <button type="button" onClick={openFix} className="vf-button-ghost" style={footButton}>
                  {t.projects.reviewFixWithAi}
                </button>
                <button
                  type="button"
                  onClick={() => void publish()}
                  disabled={publishing || saving || scriptSaving > 0 || !canPublish || !!introIssue}
                  className="vf-button-primary"
                  style={footButton}
                >
                  {publishing ? t.projects.publishing : films ? t.projects.reviewPublishAndFilm : t.projects.reviewPublishCta}
                </button>
              </>
            ) : mode === "fix" ? (
              <>
                <button type="button" onClick={closeFix} className="vf-button-ghost" style={footButton}>
                  {t.projects.reviewClose}
                </button>
                <button
                  type="button" onClick={copyFix}
                  disabled={fixBusy || !fixNote.trim() || !privateReady}
                  className="vf-button-primary" style={footButton}
                >
                  {t.projects.reviewFixCopy}
                </button>
              </>
            ) : (
              <button type="button" onClick={closeFix} className="vf-button-primary" style={footButton}>
                {t.projects.reviewClose}
              </button>
            )}
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

// "your own video, as-is"처럼 문장 가운데에 쓰던 말을 따로 세울 때 첫 글자만 키운다(한국어는 그대로).
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function PhoneGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="4.25" y="1.75" width="7.5" height="12.5" rx="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LaptopGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.75" y="3" width="10.5" height="7.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
