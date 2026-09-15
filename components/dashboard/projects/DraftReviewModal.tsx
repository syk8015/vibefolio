"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { toPreviewUrl } from "@/lib/previewOrigin";
import { detectVideoKind, getYouTubeEmbedUrl, getVimeoEmbedUrl } from "@/lib/video";
import { CONTENT_TYPES, previewDevice, normalizeTargetDevice } from "@/lib/projectTaxonomy";
import { isStepWired } from "@/lib/demoScript";
import { descriptionShapeIssue, descriptionTooLong, lineCols, DESCRIPTION_LINE_COLS_MAX } from "@/lib/descriptionShape";
import { buildDraftFixPrompt } from "@/lib/draftFixPrompt";
import { copyText } from "@/lib/clipboard";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { AiToolLogo } from "./helpers";
import { DemoScriptPanel } from "./DemoScriptPanel";
import { PreviewDevice, PHONE_VIEW, DESKTOP_VIEW } from "./PreviewDevice";
import { type DBProject } from "./types";
import { useT } from "@/lib/i18n/client";

// 초안 검토 모달 — [공개하기]의 "확인"을 실제로 할 수 있는 화면.
//
// 2026-09-15 재편(토스식 정보 표현, 사용자 확정 시안 2판 — 기억 reference-toss-ux):
// - 창을 화면의 ~90%(최대 1360px)로 넓혀 두 칸으로 나눈다. 왼쪽=미리보기, 오른쪽=판단.
//   두 칸이 따로 스크롤돼서 iframe 위에서 휠을 굴려도 판단 칸이 막히지 않는다.
// - 미리보기 틀(폰 402×874 / PC 1280×800)은 업로드한 AI가 답한 targetDevice로만 정한다.
//   사람이 바꾸는 스위치는 일부러 없다. 답이 없는 예전 초안은 분류로 짐작(previewDevice).
// - 판단 칸은 질문 하나("…를 공개할까요?") 아래에 명함 → 촬영 계획(시작 주소 한 줄 + 필름 띠).
//   촬영 주소를 명함 옆에 나란히 두지 않는다(어색하다는 사용자 판정).
// - 채운 버튼은 [공개하기] 하나. 직접 고치기·삭제는 ⋯ 안으로(폰에서 버튼이 두 줄로 접히던 문제도 해소).
//
// 살짝 고치기: 명함 렌더의 제목·소개글·한마디는 글자를 누르면 그 자리에서 고쳐진다
// (서버 게이트와 같은 규칙으로 막는다 — lib/descriptionShape). 대본은 빼기·순서만.
// 그 이상은 [AI에게 고쳐달라기] — 사람은 불만 한 줄, 고치는 건 AI(재촬영 루프와 동일).
export type DraftPatch = Partial<Pick<DBProject, "title" | "description" | "comment" | "demo_script">>;

// 목적격 조사 — 제목 끝 글자의 받침으로 을/를을 고른다(한글이 아니면 병기).
function objectParticle(word: string): string {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? "을" : "를";
  return "을(를)";
}

export function DraftReviewModal({ draft, onClose, onPublish, onEdit, onDelete, onSave }: {
  draft: DBProject;
  onClose: () => void;
  onPublish: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: (patch: DraftPatch) => Promise<void>;
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
  const ct = CONTENT_TYPES.find((c) => c.id === draft.content_type);
  const ctLabel = ct ? (t.contentTypes as Record<string, string>)[ct.id] ?? ct.label : null;
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

  // ── 인라인 편집 ─────────────────────────────────────────────────────────
  type Field = "title" | "description" | "comment";
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
    setValue(f === "title" ? draft.title : f === "description" ? draft.description : draft.comment);
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

  const save = async () => {
    if (!editing) return;
    const f = editing;
    const trimmed = value.trim();
    const problem = validate(f, trimmed);
    if (problem) { setSaveError(problem); return; }
    const current = f === "title" ? draft.title : f === "description" ? draft.description : draft.comment;
    if (trimmed === current) { cancel(); return; }
    setSaving(true);
    try {
      await onSave({ [f]: trimmed } as DraftPatch);
      setEditing(null);
    } catch {
      setSaveError(t.projects.reviewSaveFailed);
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
  const saveScript = async (next: NonNullable<DBProject["demo_script"]>) => {
    setScriptError(null);
    try {
      await onSave({ demo_script: next });
    } catch {
      setScriptError(t.projects.reviewSaveFailed);
    }
  };

  // ── AI에게 고쳐달라기 ───────────────────────────────────────────────────
  const [fixOpen, setFixOpen] = useState(false);
  const [fixNote, setFixNote] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const [fixState, setFixState] = useState<"idle" | "copied" | "failed">("idle");
  // 패널이 열리는 순간 한 번만 보이는 곳으로 끌어온다(안정된 ref 콜백 = 마운트 때만 호출).
  const revealFix = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const copyFix = async () => {
    if (!fixNote.trim() || fixBusy) return;
    setFixBusy(true);
    setFixState("idle");
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.token !== "string") throw new Error("token");
      const prompt = buildDraftFixPrompt({
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
        note: fixNote.trim(),
        token: body.token,
        origin: window.location.origin,
      }, locale);
      if (!(await copyText(prompt))) throw new Error("copy failed");
      setFixState("copied");
    } catch {
      setFixState("failed");
    } finally {
      setFixBusy(false);
    }
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

  // ── 촬영 계획 한 줄 ─────────────────────────────────────────────────────
  const steps = draft.demo_script?.steps ?? [];
  const wired = steps.filter(isStepWired).length;
  const hasOwnVideo = !!draft.video_url;
  const access = draft.demo_access;
  const accessLine = access?.url
    ? { text: `${t.projects.reviewAccessUrl} · ${access.url}`, note: access.note, warn: false }
    : access?.noLogin
      ? { text: t.projects.reviewAccessNoLogin, note: access.note, warn: false }
      : access?.impossible
        ? { text: t.projects.reviewAccessImpossible, note: access.note, warn: true }
        : { text: t.projects.reviewAccessMissing, note: undefined, warn: true };
  const opensKind: "file" | "repo" | "url" = isFile
    ? "file"
    : /github\.com\//i.test(draft.demo_url) ? "repo" : "url";
  const opensLabel = opensKind === "file"
    ? t.projects.reviewOpensFile
    : opensKind === "repo"
      ? draft.demo_url.replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      : draft.demo_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const title = draft.title || t.projects.untitled;

  // ── 스타일 ─────────────────────────────────────────────────────────────
  const fieldLabelStyle: React.CSSProperties = {
    color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.8rem", margin: "0 0 2px",
  };
  const fieldValueStyle: React.CSSProperties = {
    color: "var(--text-primary)", fontFamily: "var(--font-nunito)",
    fontSize: "0.92rem", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0,
  };
  const emptyValue = <span style={{ color: "var(--text-muted)" }}>—</span>;
  // 명함 렌더는 실제 명함(TheaterStage)처럼 작품 위에 얹힌 흰 글씨다 — 테마와 무관하게
  // 어두운 바탕이 정직하다(라이트에서도 명함은 포스터 위에 뜬다).
  const cardBg = "linear-gradient(180deg, #2a241f 0%, #1a1612 100%)";
  const editableStyle: React.CSSProperties = { cursor: "text", borderRadius: 6, transition: "background 0.15s" };
  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.08)", color: "#fff", border: "none", outline: "none",
    borderRadius: 8, padding: "6px 8px", fontFamily: "var(--font-nunito)",
  };
  const smallText: React.CSSProperties = {
    margin: 0, fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)",
  };
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
        {wide && (
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
            <div className="flex items-center justify-between gap-3" style={{ minHeight: 34 }}>
              <span
                className="rounded-full"
                style={{
                  padding: "4px 10px", background: "var(--surface-soft)", color: "var(--text-secondary)",
                  fontFamily: "var(--font-nunito)", fontSize: "0.72rem", fontWeight: 600,
                }}
              >
                {t.projects.draftBadge}
              </span>
              <div ref={menuRef} className="relative flex items-center gap-1.5">
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
                {menuOpen && (
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
            <h2
              id={`${uid}-title`}
              style={{
                margin: "8px 0 0", fontFamily: "var(--font-nunito)", fontSize: "clamp(1.3rem, 2.1vw, 1.6rem)",
                fontWeight: 700, lineHeight: 1.35, letterSpacing: "-0.02em", color: "var(--text-primary)",
                wordBreak: "keep-all", overflowWrap: "anywhere",
              }}
            >
              {t.projects.reviewAsk(title, objectParticle(title))}
            </h2>
            <p style={{ ...smallText, marginTop: 4, fontSize: "0.93rem" }}>{t.projects.reviewIntroShort}</p>
          </header>

          <div ref={bodyRef} className="vf-review-body" onScroll={measureEdges}>
            <div ref={contentRef} className="vf-review-content">
              {!wide && previewSrc && (
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

              {/* ① 명함 렌더 — 글자를 누르면 그 자리에서 고친다 */}
              <section aria-labelledby={`${uid}-card`}>
                <SectionHead id={`${uid}-card`} title={t.projects.reviewCardLabel}
                  right={<span style={smallText}>{t.projects.reviewEditHint}</span>} />
                <div className="rounded-2xl" style={{ background: cardBg, padding: "20px 24px 18px" }}>
                  {editing === "title" ? (
                    <input ref={inputRef as React.RefObject<HTMLInputElement>} value={value} onChange={e => setValue(e.target.value)}
                      onKeyDown={e => onKey(e, false)} disabled={saving}
                      className="vf-serif-display" style={{ ...inputStyle, fontSize: "1.45rem", fontWeight: 500 }} />
                  ) : (
                    <h3 className="vf-serif-display" onClick={() => begin("title")} title={t.projects.reviewEditHint}
                      style={{ ...editableStyle, fontSize: "1.45rem", fontWeight: 500, margin: 0, color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.55)", padding: "2px 4px", marginLeft: -4 }}>
                      {title}
                    </h3>
                  )}

                  {editing === "description" ? (
                    <div style={{ marginTop: 8 }}>
                      <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={value} onChange={e => setValue(e.target.value)}
                        onKeyDown={e => onKey(e, true)} rows={3} disabled={saving}
                        style={{ ...inputStyle, fontSize: 15, lineHeight: 1.55, resize: "vertical", maxWidth: 460 }} />
                      <p className="text-xs" style={{ margin: "4px 0 0", fontFamily: "var(--font-nunito)", color: descIssue ? "#f0a3a3" : "rgba(255,255,255,0.6)" }}>
                        {descIssue ?? t.projects.reviewDescMeter(descLines.length, descMaxCols, DESCRIPTION_LINE_COLS_MAX)}
                      </p>
                    </div>
                  ) : (
                    <p onClick={() => begin("description")} title={t.projects.reviewEditHint}
                      style={{
                        ...editableStyle, fontSize: 15, color: draft.description ? "rgba(255,255,255,0.84)" : "rgba(255,255,255,0.4)",
                        marginTop: 8, lineHeight: 1.55, maxWidth: 460, fontFamily: "var(--font-nunito)",
                        textShadow: "0 1px 8px rgba(0,0,0,0.5)", whiteSpace: "pre-line",
                        display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden",
                        padding: "2px 4px", marginLeft: -4,
                      }}>
                      {draft.description || t.projects.reviewDescEmpty}
                    </p>
                  )}

                  {editing === "comment" ? (
                    <input ref={inputRef as React.RefObject<HTMLInputElement>} value={value} onChange={e => setValue(e.target.value)}
                      onKeyDown={e => onKey(e, false)} disabled={saving} placeholder={t.projects.reviewNotePlaceholder}
                      style={{ ...inputStyle, fontSize: 14, marginTop: 12, maxWidth: 460 }} />
                  ) : (
                    <div onClick={() => begin("comment")} title={t.projects.reviewEditHint}
                      className="inline-block"
                      style={{
                        ...editableStyle, marginTop: 12, fontSize: 14, fontFamily: "var(--font-nunito)",
                        background: "rgba(255,255,255,0.12)", color: draft.comment ? "#fff" : "rgba(255,255,255,0.45)",
                        padding: "7px 14px", borderRadius: 14, maxWidth: 460,
                      }}>
                      {draft.comment || t.projects.reviewNotePlaceholder}
                    </div>
                  )}

                  {draft.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>
                      {draft.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.88)", fontFamily: "var(--font-nunito)", fontSize: "0.72rem" }}>
                          <AiToolLogo id={tag} size={11} />{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {editing && (
                    <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
                      <button type="button" onClick={() => void save()} disabled={saving || !!descIssue}
                        className="rounded-full" style={{ background: "#fff", color: "#1a1612", border: "none", padding: "6px 14px", fontSize: "0.8rem", fontWeight: 600, fontFamily: "var(--font-nunito)", cursor: "pointer", opacity: saving || descIssue ? 0.5 : 1 }}>
                        {t.projects.reviewEditSave}
                      </button>
                      <button type="button" onClick={cancel} disabled={saving}
                        style={{ background: "transparent", color: "rgba(255,255,255,0.7)", border: "none", padding: "6px 10px", fontSize: "0.8rem", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                        {t.projects.reviewEditCancel}
                      </button>
                      {saveError && editing !== "description" && (
                        <span className="text-xs" style={{ color: "#f0a3a3", fontFamily: "var(--font-nunito)" }}>{saveError}</span>
                      )}
                      {saveError && editing === "description" && !descIssue && (
                        <span className="text-xs" style={{ color: "#f0a3a3", fontFamily: "var(--font-nunito)" }}>{saveError}</span>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* ② 촬영 계획 — 어디서 시작해, 이 순서로 찍는다 */}
              <section aria-labelledby={`${uid}-shoot`}>
                <SectionHead
                  id={`${uid}-shoot`}
                  title={t.projects.reviewShootTitle}
                  right={!hasOwnVideo && steps.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5"
                      style={{
                        fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 600,
                        color: wired === steps.length ? "var(--text-primary)" : "#b34747",
                      }}>
                      <StatusGlyph ok={wired === steps.length} />
                      {wired === steps.length
                        ? t.projects.reviewShootAllWired(steps.length)
                        : t.projects.reviewShootPartWired(wired, steps.length)}
                    </span>
                  ) : null}
                />
                <div className="vf-review-start" data-warn={!hasOwnVideo && accessLine.warn ? "true" : "false"}>
                  <span className="vf-review-start-icon" aria-hidden>{hasOwnVideo ? <FilmGlyph /> : <EnterGlyph />}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: "var(--font-nunito)", fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.5, color: "var(--text-primary)" }}>
                      {hasOwnVideo
                        ? t.projects.reviewVideoOwn
                        : opensKind === "url"
                          ? (
                            <>
                              {t.projects.reviewStartsAtPrefix}
                              <span className="vf-mono" style={{ fontSize: "0.86rem", fontWeight: 500, overflowWrap: "anywhere" }}>{opensLabel}</span>
                              {t.projects.reviewStartsAtSuffix}
                            </>
                          )
                          : opensKind === "file"
                            ? t.projects.reviewStartFile
                            : `${t.projects.reviewOpensRepo} · ${opensLabel}`}
                    </p>
                    <p className="vf-review-start-sub" style={{ ...smallText, marginTop: 2 }}>
                      {hasOwnVideo
                        ? t.projects.reviewVideoOwnSub
                        : [accessLine.text, accessLine.note].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                {!hasOwnVideo && <DemoScriptPanel script={draft.demo_script} onChange={saveScript} />}
                {scriptError && (
                  <p style={{ ...smallText, marginTop: 8, color: "#b34747" }}>{scriptError}</p>
                )}
              </section>

              {/* ③ AI에게 고쳐달라기 */}
              {fixOpen && (
                <div ref={revealFix} className="rounded-2xl" style={{ background: "var(--surface-sunken)", padding: "16px 18px" }}>
                  <p style={{ margin: "0 0 8px", fontFamily: "var(--font-nunito)", fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {t.projects.reviewFixLead}
                  </p>
                  <textarea value={fixNote} onChange={e => { setFixNote(e.target.value); setFixState("idle"); }}
                    rows={3} placeholder={t.projects.reviewFixPlaceholder} className="vf-input w-full"
                    style={{ fontSize: "0.9rem", lineHeight: 1.6, background: "var(--surface)" }} />
                  <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 8 }}>
                    <button type="button" onClick={() => void copyFix()} disabled={fixBusy || !fixNote.trim()}
                      className="vf-button-primary" style={{ fontSize: "0.85rem", padding: "0.55rem 1.1rem", opacity: fixBusy || !fixNote.trim() ? 0.5 : 1 }}>
                      {t.projects.reviewFixCopy}
                    </button>
                    {fixState === "copied" && (
                      <span style={smallText}>{t.projects.reviewFixCopied}</span>
                    )}
                    {fixState === "failed" && (
                      <span style={{ ...smallText, color: "#b34747" }}>{t.projects.reviewFixFailed}</span>
                    )}
                  </div>
                </div>
              )}

              {/* ④ 그 밖에 — 판단에 안 쓰이는 것들은 접는다 */}
              <details className="vf-review-more">
                <summary>{t.projects.reviewMoreRow}</summary>
                <div className="flex flex-col gap-4" style={{ padding: "14px 16px 0" }}>
                  <div>
                    <p style={fieldLabelStyle}>{t.projectForm.hintLabel}</p>
                    <p style={fieldValueStyle}>{draft.demo_user_hint || emptyValue}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p style={fieldLabelStyle}>{t.projectForm.contentTypeLabel}</p>
                      <p style={fieldValueStyle}>{ct ? `${ct.emoji} ${ctLabel}` : emptyValue}</p>
                    </div>
                    <div>
                      <p style={fieldLabelStyle}>{t.projectForm.yearLabel}</p>
                      <p style={fieldValueStyle}>{draft.year || emptyValue}</p>
                    </div>
                  </div>
                  <div>
                    <p style={fieldLabelStyle}>{t.projectForm.aiToolsLabel}</p>
                    <p style={fieldValueStyle}>{draft.tags.length ? draft.tags.join(" · ") : emptyValue}</p>
                  </div>
                  <div>
                    <p style={fieldLabelStyle}>{t.projectForm.demoUrlLabel}</p>
                    <p className="vf-mono" style={{ ...fieldValueStyle, fontSize: "0.78rem", wordBreak: "break-all" }}>
                      {isFile ? t.projects.reviewFileUpload : (draft.demo_url || emptyValue)}
                    </p>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* 아래 버튼 줄 — 채운 버튼은 공개하기 하나 */}
          <footer className="vf-review-foot" data-at-end={edges.atEnd ? "true" : "false"}>
            <p className="vf-review-foot-note">
              {hasOwnVideo ? t.projects.reviewPublishNoteVideo : t.projects.reviewPublishNote}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFixOpen((v) => !v)}
                aria-expanded={fixOpen}
                className="vf-button-ghost"
                style={{
                  fontSize: "0.92rem", padding: "0.72rem 1.15rem",
                  background: fixOpen ? "var(--surface-soft-hover)" : undefined,
                }}
              >
                {t.projects.reviewFixWithAi}
              </button>
              <button
                type="button"
                onClick={onPublish}
                className="vf-button-primary"
                style={{ fontSize: "0.92rem", padding: "0.72rem 1.4rem", minWidth: 120 }}
              >
                {t.projects.reviewPublishCta}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function SectionHead({ id, title, right }: { id: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1" style={{ marginBottom: 12 }}>
      <h3
        id={id}
        style={{
          margin: 0, fontFamily: "var(--font-nunito)", fontSize: "1.15rem", fontWeight: 700,
          letterSpacing: "-0.015em", color: "var(--text-primary)",
        }}
      >
        {title}
      </h3>
      {right}
    </div>
  );
}

function StatusGlyph({ ok }: { ok: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      {ok ? (
        <path d="M4.7 8.2l2.1 2.1 4.5-4.7" fill="none" style={{ stroke: "var(--bg)" }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <path d="M8 4.2v4.6" style={{ stroke: "var(--bg)" }} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="1" style={{ fill: "var(--bg)" }} />
        </>
      )}
    </svg>
  );
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

function EnterGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 8h7.5M7 4.5L10.5 8 7 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 2.5h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FilmGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6.2v3.6L10 8 7 6.2z" fill="currentColor" />
    </svg>
  );
}
