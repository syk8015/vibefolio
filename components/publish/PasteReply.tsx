"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { buildPublishFixPrompt } from "@/lib/publishFixPrompt";
import { copyText } from "@/lib/clipboard";
import { extractPublishJson } from "@/lib/extractPublishJson";

// AI 답 붙여넣기 본체 — /publish 페이지와 연결 창(ConnectPanel) 두 곳에서 쓴다.
//
// 2026-09-22(D6 사용자 확정): 채팅 AI 사용자는 답을 들고 /publish로 넘어가야 했고, 폰에선
// 새 브라우저가 열려 다시 로그인까지 해야 했다. 같은 쿠키 인제스트 경로를 연결 창 안에서도
// 부른다 — 새 통로가 아니라 /publish의 칸을 옮겨 놓은 것이다(09-18 "채팅창 전용 통로는 더
// 짓지 않는다"와 충돌하지 않음). 서버 게이트도 그대로 한 벌(/api/ingest).
//
// 붙여넣은 글은 JSON으로 **읽기만** 한다(extractPublishJson — 실행하지 않음). 올라간 것은
// 내 계정의 초안이 될 뿐이고, 공개는 내가 확인 화면에서 누를 때만 된다.
//
// 라 시안(2026-10-01 덜어내기): 진한 버튼 하나가 상태에 따라 이름을 바꾼다.
// - /publish: 칸이 비면 [클립보드에서 붙여넣기](칸만 채운다), 차면 [초안으로 올리기]. 올리기가 따로라
//   파일은 붙여넣은 뒤에 골라도 같이 간다. 서버가 사유를 주고 거절한 글이 칸에 그대로면 다시 보내도
//   또 거절되므로 버튼이 [클립보드에서 붙여넣기]로 돌아간다(AI가 고친 답을 받아 올 차례).
// - compact(연결 창): [AI 답 붙여넣기] = 클립보드를 읽어 바로 올린다. "파일도 있어요"와 펼친 파일 칸은
//   버튼 **위**에 선다 — 누르는 순간 올라가서 파일은 먼저 골라야 같이 간다(B4).
//   글상자는 클립보드 읽기가 막혔거나 읽은 글이 올릴 답이 아닐 때 펼친다 — 실패는 숨기지 않는다.
//
// 업그레이드(2026-10-01): /publish는 칸 오른쪽에 '초안 미리보기' 판(aside)을 두고, 칸의 글을 페이지에
// 알린다(onBoxChange — 맨 위 3단계 길이 따라간다). 연결 창은 실패 문구가 떠 있는지를 받아(onFailedChange)
// 진행 줄의 붙여넣기 칸을 빨간 테로 그리고, 올린 뒤엔 소개글까지 받아 작은 초안 카드를 그린다.
type Kind = "bundle" | "screenshot" | "video";
const MB = 1024 * 1024;
// 서버 캡과 같은 값으로 미리 막는다 — 20MB를 올려놓고 finalize에서 거절당하면 사람은 왜 안 되는지 모른다.
const CAP_MB: Record<Kind, number> = { bundle: 25, screenshot: 5, video: 20 };
const KINDS: Kind[] = ["bundle", "screenshot", "video"];

/** 연결 창의 한 줄 파일 칸 — 고른 파일의 종류를 알아서 가른다. */
function kindOf(file: File): Kind | null {
  if (/\.(html?|zip)$/i.test(file.name)) return "bundle";
  if (file.type.startsWith("image/")) return "screenshot";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export function PasteReply({
  compact = false,
  lead,
  note,
  aside,
  onBoxChange,
  onFailedChange,
  onSuccess,
}: {
  compact?: boolean;
  /** compact: 버튼 위에 먼저 서는 줄(연결 창의 "복사했어요" 줄). 글상자를 펼치면 숨는다. */
  lead?: React.ReactNode;
  /** compact: 버튼 바로 아래 한 줄(공개 범위). */
  note?: React.ReactNode;
  /** /publish: 칸 오른쪽 판(초안 미리보기). 좁은 화면에선 버튼 아래로 내려간다. */
  aside?: React.ReactNode;
  /** /publish: 칸의 글이 바뀔 때마다 — rejected = 서버가 거절한 그 글 그대로(다시 붙여넣을 차례). */
  onBoxChange?: (text: string, rejected: boolean) => void;
  /** compact: 실패 문구가 떠 있는 동안 true(사라지거나 이 칸이 내려가면 false). */
  onFailedChange?: (failed: boolean) => void;
  onSuccess: (projectId: string, title: string | null, description: string | null) => void;
}) {
  const { t, locale } = useT();
  const tp = t.publish;
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"idle" | "zipping" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  // 서버가 되돌려보낸 사유만 따로 들고 있는다. JSON 파싱 같은 **로컬** 오류는
  // AI에게 되물을 게 아니라 사람이 다시 붙여넣으면 되는 일이라 버튼을 띄우지 않는다.
  const [bounce, setBounce] = useState<string | null>(null);
  const [fixCopied, setFixCopied] = useState(false);
  // 마지막으로 보낸 JSON — 되돌려보내기 프롬프트에 싣는다(칸의 설명 섞인 글이 아니라 보낸 그대로).
  const [sentJson, setSentJson] = useState("");
  // 같은 글로 다시 보내면 또 거절될 글(로컬 파싱 실패·서버 게이트 거절). /publish 버튼 이름을 가른다.
  const [failedText, setFailedText] = useState<string | null>(null);
  // 파일 첨부(2026-09-17). 채팅창 AI는 파일을 서버로 못 보내지만 **사람 손엔 파일이 있다** —
  // Claude 아티팩트의 "Download as HTML" 같은 것. 조사에서 바이브코딩 프로젝트의 60%가 "인터넷에
  // 올리는 법을 몰라" 배포 전에 버려진다고 나왔고, 이 칸이 그 지점을 받는다. .html 한 장은
  // 브라우저에서 index.html로 zip해 기존 번들 경로를 탄다(서버 storeZipBundle이 index.html을 요구한다).
  const [files, setFiles] = useState<Record<Kind, File | null>>({ bundle: null, screenshot: null, video: null });
  const [showFiles, setShowFiles] = useState(false);
  // 이 화면에서 이미 만든 초안(B5, 2026-09-22). 서버는 파일 업로드보다 초안 행을 먼저 만든다 —
  // 파일 PUT·finalize가 실패한 뒤 다시 누르면 새 초안이 또 생겨 빈 초안이 쌓였다. 첫 응답의 id를
  // 들고 있다가 재시도 때 draftId로 그 초안을 갱신한다.
  const [draftId, setDraftId] = useState<string | null>(null);
  // compact: 클립보드 읽기를 브라우저가 막았을 때 펼치는 글상자.
  const [typing, setTyping] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // 부모에게 알리기 — 부르는 쪽이 매번 새 함수를 넘겨도 다시 돌지 않게 Effect Event로 감싼다.
  const reportBox = useEffectEvent((text: string, rejected: boolean) => onBoxChange?.(text, rejected));
  useEffect(() => {
    reportBox(raw, raw !== "" && raw === failedText);
  }, [raw, failedText]);
  const reportFailed = useEffectEvent((failed: boolean) => onFailedChange?.(failed));
  useEffect(() => {
    if (error === null) return;
    reportFailed(true);
    return () => reportFailed(false);
  }, [error]);

  // 파일을 바꾸거나 새로 붙여넣으면 다음 보내기는 다른 요청이다 — 거절 표식(failedText)도 같이 지운다.
  function reset() {
    setError(null);
    setBounce(null);
    setFixCopied(false);
    setFailedText(null);
  }

  async function copyFix() {
    if (!bounce) return;
    if (await copyText(buildPublishFixPrompt(bounce, sentJson || raw.trim(), locale))) {
      setFixCopied(true);
      setTimeout(() => setFixCopied(false), 2500);
    } else {
      setError(tp.errors.copyFailed);
    }
  }

  // 문자열 → 페이로드. 실패 사유는 여기서 사람 말로 바꿔 돌려준다.
  function parse(text: string): { payload: Record<string, unknown>; json: string } | null {
    const r = extractPublishJson(text);
    if (r.ok) return { payload: r.payload, json: r.json };
    setError(
      r.reason === "empty" ? tp.errors.empty
        : r.reason === "url-only" ? tp.errors.urlOnly
          : r.reason === "no-object" ? tp.errors.noJson
            : tp.errors.invalidJson,
    );
    if (r.reason !== "empty") setFailedText(text);
    return null;
  }

  /** .html 한 장 → index.html 하나짜리 zip. 이미 zip이면 그대로. */
  async function buildBundle(file: File): Promise<Blob> {
    if (/\.zip$/i.test(file.name)) return file;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    // 이름이 artifact.html이든 뭐든 index.html로 넣는다 — 서버가 그 이름으로 진입점을 찾는다.
    zip.file("index.html", await file.text());
    return zip.generateAsync({ type: "blob" });
  }

  async function submitPayload(payload: Record<string, unknown>, json: string, source: string) {
    setSubmitting(true);
    setSentJson(json);
    const stop = () => { setSubmitting(false); setStage("idle"); };
    // 서버가 사유를 준 거절(게이트·크기)은 같은 글로 또 보내면 또 거절된다 — 사유를 AI에게 넘길 수
    // 있게 붙잡는다. 로그인·속도 제한·서버 오류는 잠시 뒤 같은 글로 다시 보내면 되는 일이라 제외.
    // textIsBad: /api/ingest 거절은 글(JSON) 탓이라 같은 글로는 또 거절된다. finalize 거절은 거의 파일
    // 탓(index.html 없음·용량)이라 파일만 바꾸면 같은 글로 다시 보내도 된다 — 버튼을 클립보드로 돌리지 않는다.
    const reject = (status: number, reason: unknown, fallback: string, textIsBad = true) => {
      const text = typeof reason === "string" && reason ? reason : fallback;
      setError(text);
      if (text !== fallback && (status === 400 || status === 413 || status === 422)) {
        setBounce(text);
        if (textIsBad) setFailedText(source);
      }
      stop();
    };
    try {
      // 파일이 있으면 종류만 **선언**해 서명 URL을 받고, 스토리지로 직접 PUT한 뒤
      // finalize로 연결한다(CLI와 같은 2단계 — Vercel 본문 상한 ~4.5MB 우회).
      const blobs: Record<Kind, Blob | null> = { bundle: null, screenshot: files.screenshot, video: files.video };
      if (files.bundle) {
        setStage("zipping");
        blobs.bundle = await buildBundle(files.bundle);
        if (blobs.bundle.size > CAP_MB.bundle * MB) {
          setError(tp.fileTooLarge(files.bundle.name, CAP_MB.bundle));
          stop();
          return;
        }
      }
      const kinds = KINDS.filter((k) => blobs[k]);
      setStage("idle");

      // AI가 draftId·newDraft를 직접 적었으면 그 뜻을 따른다(둘을 같이 보내면 400).
      const reuse = draftId && payload.draftId === undefined && payload.newDraft === undefined ? draftId : null;
      const send = (withDraft: string | null) => fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ...(withDraft ? { draftId: withDraft } : {}), ...(kinds.length ? { uploads: kinds } : {}) }),
      });
      let res = await send(reuse);
      // 들고 있던 초안을 그사이 대시보드에서 지웠거나 공개했다 — 잊고 새로 만든다.
      if (reuse && (res.status === 404 || res.status === 409)) {
        setDraftId(null);
        res = await send(null);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return reject(res.status, body.error, tp.errors.submitFailed);

      if (typeof body.projectId === "string") setDraftId(body.projectId);

      if (body.uploads && body.finalizeUrl) {
        setStage("uploading");
        for (const kind of kinds) {
          const url = (body.uploads as Record<string, string | undefined>)[kind];
          const blob = blobs[kind];
          if (!url || !blob) continue;
          const put = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": blob.type || "application/octet-stream" },
            body: blob,
          });
          if (!put.ok) {
            setError(tp.errors.uploadFailed);
            stop();
            return;
          }
        }
        const fin = await fetch(body.finalizeUrl as string, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: body.projectId }),
        });
        const finBody = await fin.json().catch(() => ({}));
        if (!fin.ok) return reject(fin.status, finBody.error, tp.errors.uploadFailed, false);
      }
      const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : null;
      const description = typeof payload.description === "string" && payload.description.trim() ? payload.description : null;
      onSuccess(body.projectId as string, title, description);
    } catch {
      setError(tp.errors.network);
      stop();
    }
  }

  async function submit() {
    if (submitting) return;
    reset();
    const parsed = parse(raw);
    if (!parsed) return;
    await submitPayload(parsed.payload, parsed.json, raw);
  }

  // 클립보드 읽기 — 권한을 브라우저가 묻는다. 막히면 칸에 직접 붙여넣게 한다.
  async function fromClipboard() {
    if (submitting) return;
    reset();
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError(tp.clipboardDenied);
      if (compact) setTyping(true);
      else boxRef.current?.focus();
      return;
    }
    const r = extractPublishJson(text);
    if (!r.ok) {
      // 연결 창: 읽기는 됐는데 올릴 답이 아니다(잘린 답·쉼표 하나 등). 글상자를 그 글로 펼쳐 사유를
      // 보여 준다 — 고쳐서 바로 올리거나 AI 답을 다시 붙여넣을 수 있게(전엔 '직접 붙여넣을래요'가 늘 있었다).
      if (compact && r.reason !== "empty") {
        setTyping(true);
        setRaw(text);
        parse(text);
        return;
      }
      setError(tp.clipboardEmpty);
      return;
    }
    if (compact) {
      setRaw(r.json);
      await submitPayload(r.payload, r.json, r.json);
      return;
    }
    // /publish: 칸만 채운다(AI 답 그대로 — 설명이 섞여 있어도 올릴 때 골라낸다).
    setRaw(text);
    setFailedText(null);
  }

  function pickOne(kind: Kind, file: File | null, input: HTMLInputElement) {
    if (file && file.size > CAP_MB[kind] * MB) {
      setError(tp.fileTooLarge(file.name, CAP_MB[kind]));
      input.value = "";
      return;
    }
    reset();
    setFiles((prev) => ({ ...prev, [kind]: file }));
  }

  // 연결 창의 한 줄 칸: 여러 파일을 한 번에 받아 종류별로 넣는다. 다시 고르면 같은 종류만 바뀐다.
  function pickMany(list: FileList | null) {
    if (!list?.length) return;
    reset();
    const next = { ...files };
    const seen = new Set<Kind>();
    let problem: string | null = null;
    for (const f of Array.from(list)) {
      const kind = kindOf(f);
      if (!kind) problem ??= tp.fileKindUnknown(f.name);
      else if (seen.has(kind)) problem ??= tp.fileOneEach;
      else if (f.size > CAP_MB[kind] * MB) problem ??= tp.fileTooLarge(f.name, CAP_MB[kind]);
      else {
        seen.add(kind);
        next[kind] = f;
      }
    }
    setFiles(next);
    if (problem) setError(problem);
  }

  const chosen = KINDS.filter((k) => files[k]);

  // 진한 버튼 하나 — 상태에 따라 이름과 할 일이 바뀐다. 글자만큼(알약)이고 둘레 줄과 함께 가운데에
  // 선다(라, 2026-10-01). /publish: 칸이 비었거나 거절된 글 그대로면 클립보드, 아니면 올리기.
  const needsClipboard = !raw.trim() || raw === failedText;
  const readsClipboard = compact ? !typing : needsClipboard;
  const busyLabel = stage === "zipping" ? tp.zipping : stage === "uploading" ? tp.uploadingFiles : tp.submitting;
  const mainLabel = compact
    ? (typing ? tp.submit : tp.pasteButton)
    : (needsClipboard ? tp.clipboardButton : tp.submit);
  const mainButton = (
    <button
      type="button"
      onClick={() => void (readsClipboard ? fromClipboard() : submit())}
      disabled={submitting}
      className="vf-button-primary self-center"
      style={{ fontSize: "1rem", padding: "0.85rem 2.2rem", opacity: submitting ? 0.6 : 1 }}
    >
      {submitting ? busyLabel : mainLabel}
    </button>
  );

  const filesLink = (
    <button
      type="button"
      onClick={() => setShowFiles(true)}
      className="vf-button-text self-center"
      style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: 3 }}
    >
      {tp.filesLink}
    </button>
  );

  // 실패는 접지 않는다 — 어느 모드든 버튼 바로 위에 늘 보인다.
  const errorBlock = (
    <>
      {error && (
        <p role="alert" className="text-center" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.6, margin: 0 }}>
          {error}
        </p>
      )}
      {bounce && (
        <button type="button" onClick={copyFix} className="vf-button-ghost self-center" style={{ fontSize: "0.875rem", padding: "0.5rem 1.1rem" }}>
          {fixCopied ? tp.fixCopied : tp.fixWithAi}
        </button>
      )}
    </>
  );

  // 글자 크기는 .vf-input에 맡긴다(PC 14.4 · 폰 16) — 인라인으로 16px 미만을 박으면 폰 규칙을
  // 이겨서, 아이폰이 칸을 누르는 순간 화면을 확대했다(/publish 2026-09-24, 연결 창 09-25).
  // 안내문은 본문 글꼴(.vf-placeholder-prose) + 낱말 단위 줄바꿈(keep-all).
  const textarea = (
    <textarea
      ref={boxRef}
      aria-label={tp.pastePlaceholder}
      className="vf-input vf-placeholder-prose w-full"
      style={{ minHeight: compact ? 110 : 250, fontFamily: "var(--font-mono), monospace", lineHeight: 1.6, wordBreak: "keep-all", resize: "vertical" }}
      placeholder={tp.pastePlaceholder}
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
    />
  );

  if (compact) {
    // 한 줄 파일 칸 — 작품 파일·스크린샷·영상을 한 번에 고른다.
    const picker = (
      <div className="w-full rounded-2xl flex items-center gap-3" style={{ background: "var(--surface-soft)", padding: "0.75rem 0.75rem 0.75rem 1rem" }}>
        <div className="min-w-0 flex-1">
          <p style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.5, margin: 0 }}>
            {tp.filesAll}
          </p>
          {chosen.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", lineHeight: 1.5, margin: 0 }}>
              {tp.filesAllHint}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {chosen.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={submitting}
                  onClick={() => { reset(); setFiles((prev) => ({ ...prev, [kind]: null })); }}
                  aria-label={`${files[kind]!.name} ${tp.fileClear}`}
                  title={tp.fileClear}
                  className="rounded-full inline-flex items-center gap-1.5"
                  style={{
                    maxWidth: "100%", padding: "0.2rem 0.65rem", border: "none", cursor: "pointer",
                    background: "var(--surface-active)", color: "var(--text-primary)",
                    fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.5,
                  }}
                >
                  <span className="truncate">{files[kind]!.name}</span>
                  <span aria-hidden="true" style={{ flexShrink: 0 }}>✕</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="vf-file-pick" data-disabled={submitting || undefined}>
          {tp.pickFiles}
          <input
            type="file" multiple accept=".html,.htm,.zip,image/*,video/*" disabled={submitting}
            className="sr-only" aria-label={tp.filesAll}
            onChange={(e) => { pickMany(e.target.files); e.target.value = ""; }}
          />
        </label>
      </div>
    );
    return (
      <>
        {!typing && lead}
        {showFiles ? picker : !typing && filesLink}
        {errorBlock}
        {typing && textarea}
        {mainButton}
        {note}
      </>
    );
  }

  // /publish — 큰 칸 · "파일도 있어요" · 버튼 하나. 넓은 화면에선 칸 오른쪽에 aside(초안 미리보기)가 서고,
  // 좁으면 그 판이 버튼 아래로 내려간다 — 칸 → 버튼으로 이어지는 라 흐름은 그대로 둔다.
  const rows: { kind: Kind; label: string; accept: string }[] = [
    { kind: "bundle", label: tp.pickHtml, accept: ".html,.htm,.zip" },
    { kind: "screenshot", label: tp.pickShot, accept: "image/*" },
    { kind: "video", label: tp.pickVideo, accept: "video/*" },
  ];
  // 한 줄에 "이름 … [파일 고르기]"(2026-09-24) — 브라우저 기본 파일 칸은 "파일 선택 선택된 파일 없음"이
  // 글자로만 보여 누르는 곳인 줄 몰랐다. 진짜 입력칸은 버튼 모양 라벨(.vf-file-pick) 안에 숨긴다.
  const fileBox = (
    <div className="rounded-2xl flex flex-col gap-2.5" style={{ background: "var(--surface-soft)", padding: "14px 18px" }}>
      {rows.map((row) => {
        const file = files[row.kind];
        return (
          <div key={row.kind} className="flex items-center justify-between gap-3">
            <span style={{ flex: "1 1 0", minWidth: 0, color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", lineHeight: 1.5, wordBreak: "keep-all" }}>
              {row.label}
            </span>
            {file ? (
              <div className="flex items-center gap-2" style={{ flexShrink: 0, maxWidth: "60%" }}>
                <span title={file.name} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem" }}>
                  {tp.fileChosen(file.name)}
                </span>
                <button type="button" disabled={submitting} onClick={() => { reset(); setFiles((prev) => ({ ...prev, [row.kind]: null })); }} className="vf-file-pick" style={{ fontSize: "0.8125rem", fontWeight: 500, padding: "0.3rem 0.8rem" }}>
                  {tp.fileClear}
                </button>
              </div>
            ) : (
              <label className="vf-file-pick" data-disabled={submitting || undefined}>
                {tp.pickFile}
                <input
                  type="file" accept={row.accept} disabled={submitting}
                  className="sr-only" aria-label={row.label}
                  onChange={(e) => pickOne(row.kind, e.target.files?.[0] ?? null, e.target)}
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className={`grid gap-5${aside ? " lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-6" : ""}`}>
      <div className="flex flex-col gap-3.5 min-w-0">
        {textarea}
        {showFiles && fileBox}
      </div>
      {aside && <div className="order-last flex lg:order-none lg:col-start-2 lg:row-start-1">{aside}</div>}
      <div className={`flex flex-col items-stretch gap-5${aside ? " lg:col-span-2" : ""}`}>
        {!showFiles && filesLink}
        {errorBlock}
        {mainButton}
      </div>
    </div>
  );
}
