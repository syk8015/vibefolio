"use client";

import { useState } from "react";
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
// compact: 연결 창용. 파일 칸은 접어 두고(누르면 맨 위에 펼침 — B4 순서 유지), 글상자를 줄인다.
export function PasteReply({
  compact = false,
  onSuccess,
}: {
  compact?: boolean;
  onSuccess: (projectId: string) => void;
}) {
  const { t, locale } = useT();
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 서버가 되돌려보낸 사유만 따로 들고 있는다. JSON 파싱 같은 **로컬** 오류는
  // AI에게 되물을 게 아니라 사람이 다시 붙여넣으면 되는 일이라 버튼을 띄우지 않는다.
  const [bounce, setBounce] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 파일 첨부(2026-09-17). 채팅창 AI는 파일을 서버로 못 보내지만 **사람 손엔 파일이
  // 있다** — Claude 아티팩트의 "Download as HTML" 같은 것. 조사에서 바이브코딩
  // 프로젝트의 60%가 "인터넷에 올리는 법을 몰라" 배포 전에 버려진다고 나왔고,
  // 이 칸이 그 지점을 정확히 받는다. .html 한 장은 브라우저에서 index.html로 zip해
  // 기존 번들 경로를 그대로 탄다(서버 storeZipBundle이 index.html을 요구한다).
  const [workFile, setWorkFile] = useState<File | null>(null);
  const [shotFile, setShotFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "zipping" | "uploading">("idle");
  // 이 화면에서 이미 만든 초안(B5, 2026-09-22). 서버는 파일 업로드보다 초안 행을 먼저
  // 만든다 — 파일 PUT·finalize가 실패한 뒤 다시 누르면 새 초안이 또 생겨 대시보드에 빈
  // 초안이 쌓였다. 첫 응답의 id를 들고 있다가 재시도 때 draftId로 그 초안을 갱신한다.
  const [draftId, setDraftId] = useState<string | null>(null);

  async function copyFix() {
    if (!bounce) return;
    try {
      if (!(await copyText(buildPublishFixPrompt(bounce, raw.trim(), locale)))) throw new Error("copy failed");
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(t.publish.errors.copyFailed);
    }
  }

  // 문자열 → 페이로드. 실패 사유는 여기서 사람 말로 바꿔 돌려준다.
  function parse(text: string): Record<string, unknown> | null {
    const r = extractPublishJson(text);
    if (r.ok) return r.payload;
    setError(
      r.reason === "empty" ? t.publish.errors.empty
        : r.reason === "url-only" ? t.publish.errors.urlOnly
          : r.reason === "no-object" ? t.publish.errors.noJson
            : t.publish.errors.invalidJson,
    );
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

  async function submitPayload(payload: Record<string, unknown>) {
    setSubmitting(true);
    const fail = (msg: string) => { setError(msg); setSubmitting(false); setStage("idle"); };
    try {
      // 파일이 있으면 종류만 **선언**해 서명 URL을 받고, 스토리지로 직접 PUT한 뒤
      // finalize로 연결한다(CLI와 같은 2단계 — Vercel 본문 상한 ~4.5MB 우회).
      const kinds: string[] = [];
      let bundle: Blob | null = null;
      if (workFile) {
        setStage("zipping");
        bundle = await buildBundle(workFile);
        if (bundle.size > 25 * 1024 * 1024) return fail(t.publish.fileTooLarge(workFile.name, 25));
        kinds.push("bundle");
      }
      if (shotFile) kinds.push("screenshot");
      if (videoFile) kinds.push("video");
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
      if (!res.ok) {
        const reason = body.error || t.publish.errors.submitFailed;
        setError(reason);
        // 서버가 준 사유는 "무엇을 어떻게 고쳐야 하는지"를 이미 다 담고 있다 —
        // 사람이 옮겨 적는 대신 AI에게 통째로 넘길 수 있게 붙잡아 둔다.
        if (body.error) setBounce(reason);
        setSubmitting(false);
        return;
      }

      if (typeof body.projectId === "string") setDraftId(body.projectId);

      if (body.uploads && body.finalizeUrl) {
        setStage("uploading");
        const parts: [string, Blob | null][] = [["bundle", bundle], ["screenshot", shotFile], ["video", videoFile]];
        for (const [kind, blob] of parts) {
          const url = (body.uploads as Record<string, string | undefined>)[kind];
          if (!url || !blob) continue;
          const put = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": blob.type || "application/octet-stream" },
            body: blob,
          });
          if (!put.ok) return fail(t.publish.errors.uploadFailed);
        }
        const fin = await fetch(body.finalizeUrl as string, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: body.projectId }),
        });
        const finBody = await fin.json().catch(() => ({}));
        if (!fin.ok) {
          const reason = finBody.error || t.publish.errors.uploadFailed;
          setError(reason);
          if (finBody.error) setBounce(reason);
          setSubmitting(false);
          setStage("idle");
          return;
        }
      }
      onSuccess(body.projectId as string);
    } catch {
      setError(t.publish.errors.network);
      setSubmitting(false);
      setStage("idle");
    }
  }

  function reset() {
    setError(null);
    setBounce(null);
    setCopied(false);
  }

  async function submit(text = raw) {
    reset();
    const payload = parse(text);
    if (!payload) return;
    await submitPayload(payload);
  }

  // 클립보드 버튼: 읽기 권한을 브라우저가 묻는다. 거부되면 수동 붙여넣기로 안내.
  async function fromClipboard() {
    reset();
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError(t.publish.clipboardDenied);
      return;
    }
    const r = extractPublishJson(text);
    if (!r.ok) {
      setError(t.publish.clipboardEmpty);
      return;
    }
    setRaw(r.json);
    await submitPayload(r.payload);
  }

  // 붙여넣는 순간 올린다 — 붙여넣기 뒤에 또 버튼을 찾게 하지 않는다. 골라내기에
  // 실패하면 텍스트만 남기고 사유를 보여준다(사람이 고쳐서 버튼으로 올릴 수 있게).
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.trim() || submitting) return;
    e.preventDefault();
    setRaw(text);
    void submit(text);
  }

  const [showFiles, setShowFiles] = useState(false);
  // 연결 창의 카드 안에 들어가면 바탕색이 겹쳐 칸이 묻힌다 — compact는 상자 없이 편다.
  const boxStyle: React.CSSProperties = compact
    ? { padding: 0 }
    : { background: "var(--surface-soft)", padding: "16px 18px" };

  return (
    <div>
    {/* 파일 첨부 — 인터넷에 안 올린 작품용. 맨 위에 두는 이유(B4, 2026-09-22): 아래 두 칸은
        붙여넣는 순간 바로 올린다. 파일 칸이 그 아래 있으면 위에서부터 따라 한 사람은 JSON만
        먼저 올라가 파일 없는 초안이 생겼다. 조사(2026-09-17): 바이브코딩 프로젝트의
        60%가 배포 전에 버려지고, 막히는 지점이 "로컬에선 되는데 올리는 법을 모르겠다"였다. */}
    {(!compact || showFiles) && (
    <div className="rounded-2xl mb-5" style={boxStyle}>
      <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, margin: 0 }}>
        {t.publish.filesTitle}
      </p>
      <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7, margin: "6px 0 12px" }}>
        {t.publish.filesHint}
      </p>
      {([
        { label: t.publish.pickHtml, accept: ".html,.htm,.zip", file: workFile, set: setWorkFile, mb: 25 },
        { label: t.publish.pickShot, accept: "image/*", file: shotFile, set: setShotFile, mb: 5 },
        { label: t.publish.pickVideo, accept: "video/*", file: videoFile, set: setVideoFile, mb: 20 },
      ] as { label: string; accept: string; file: File | null; set: (f: File | null) => void; mb: number }[]).map((row) => (
        <div key={row.label} style={{ marginBottom: 10 }}>
          <label className="text-xs block" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", marginBottom: 4 }}>
            {row.label}
          </label>
          {row.file ? (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
                {t.publish.fileChosen(row.file.name)}
              </span>
              <button type="button" onClick={() => row.set(null)} className="vf-button-ghost" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
                {t.publish.fileClear}
              </button>
            </div>
          ) : (
            <input
              type="file" accept={row.accept} disabled={submitting}
              className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                // 서버 캡과 같은 값으로 미리 막는다 — 20MB를 올려놓고 finalize에서
                // 거절당하면 사람은 왜 안 되는지 모른다.
                if (f && f.size > row.mb * 1024 * 1024) {
                  setError(t.publish.fileTooLarge(f.name, row.mb));
                  e.target.value = "";
                  return;
                }
                reset();
                row.set(f);
              }}
            />
          )}
        </div>
      ))}
    </div>
    )}
    {compact && !showFiles && (
      <button type="button" onClick={() => setShowFiles(true)} className="text-xs mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
        {t.publish.filesToggle}
      </button>
    )}

    {/* 1순위: 버튼 하나 */}
    <div className="rounded-2xl mb-5" style={boxStyle}>
      <button onClick={fromClipboard} disabled={submitting} className="vf-button-primary" style={{ opacity: submitting ? 0.6 : 1 }}>
        {submitting ? t.publish.submitting : t.publish.clipboardButton}
      </button>
      <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7, margin: "10px 0 0" }}>
        {t.publish.clipboardHint}
      </p>
    </div>

    {/* 2순위: 붙여넣기 = 제출 */}
    <p className="text-xs mb-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
      {t.publish.pasteHint}
    </p>
    <textarea
      className="vf-input w-full"
      style={{ minHeight: compact ? 110 : 180, fontFamily: "var(--font-mono), monospace", fontSize: "0.85rem", lineHeight: 1.6 }}
      placeholder={t.publish.pastePlaceholder}
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onPaste={onPaste}
    />

    {error && (
      <div className="mt-3">
        <p className="text-sm" style={{ color: "var(--danger, #c0392b)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>{error}</p>
        {bounce && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button onClick={copyFix} className="vf-button-ghost" style={{ fontSize: "0.85rem" }}>
              {copied ? t.publish.fixCopied : t.publish.fixWithAi}
            </button>
            <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {t.publish.fixHint}
            </span>
          </div>
        )}
      </div>
    )}

    <div className="flex items-center gap-3 mt-5">
      <button onClick={() => void submit()} disabled={submitting} className="vf-soft-fill rounded-full"
        style={{ padding: "0.6rem 1.3rem", fontFamily: "var(--font-nunito)", fontSize: "0.85rem", fontWeight: 500, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
        {submitting
          ? stage === "zipping" ? t.publish.zipping
            : stage === "uploading" ? t.publish.uploadingFiles
              : t.publish.submitting
          : t.publish.submit}
      </button>
      <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
        {t.publish.reviewNote}
      </span>
    </div>
    </div>
  );
}
