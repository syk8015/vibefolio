"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import LanguageToggle from "@/components/LanguageToggle";
import { buildPublishFixPrompt } from "@/lib/publishFixPrompt";
import { extractPublishJson } from "@/lib/extractPublishJson";

// 셸 없는 챗봇 경로의 마지막 구간 — 사람이 AI 답을 옮겨 오는 자리.
//
// 2026-09-04(인터뷰 ⑦): 웹 챗 AI는 서버로 직접 못 보내니 사람이 옮기는 건 구조적으로
// 남는다. 대신 **동작 수를 줄인다**. 전엔 복사 → 이동 → 펜스 지우기 → 붙여넣기 → 버튼.
// 이제 (1) 클립보드 버튼 하나로 골라내서 바로 올리거나 (2) 붙여넣는 순간 바로 올라간다.
// 펜스·설명이 섞인 AI 답을 통째로 받아도 된다(lib/extractPublishJson).
export default function PublishForm() {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 서버가 되돌려보낸 사유만 따로 들고 있는다. JSON 파싱 같은 **로컬** 오류는
  // AI에게 되물을 게 아니라 사람이 다시 붙여넣으면 되는 일이라 버튼을 띄우지 않는다.
  const [bounce, setBounce] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const { t, locale } = useT();

  async function copyFix() {
    if (!bounce) return;
    try {
      await navigator.clipboard.writeText(buildPublishFixPrompt(bounce, raw.trim(), locale));
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

  async function submitPayload(payload: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
      router.push(`/dashboard?review=${body.projectId}`);
    } catch {
      setError(t.publish.errors.network);
      setSubmitting(false);
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

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
            {t.publish.backToDashboard}
          </Link>
          <LanguageToggle />
        </div>

        <h1 className="vf-serif-display mt-6 mb-2" style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", fontWeight: 500 }}>
          {t.publish.title}
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
          {t.publish.intro} {t.publish.promptHintBefore}
          <Link href="/dashboard" style={{ color: "var(--text-primary)", textDecoration: "underline" }}>{t.publish.promptHintLink}</Link>
          {t.publish.promptHintAfter}
        </p>

        {/* 1순위: 버튼 하나 */}
        <div className="rounded-2xl mb-5" style={{ background: "var(--surface-soft)", padding: "16px 18px" }}>
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
          style={{ minHeight: 180, fontFamily: "var(--font-mono), monospace", fontSize: "0.85rem", lineHeight: 1.6 }}
          placeholder={'{\n  "title": "...",\n  "description": "...",\n  "demoScript": { "steps": [{ "goal": "...", "selector": "...", "action": "click", "expect": "..." }] },\n  "demoAccess": { "noLogin": true, "note": "..." },\n  "tags": ["Claude Code"],\n  "contentType": "web-app",\n  "deployUrl": "https://..."\n}'}
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
            {submitting ? t.publish.submitting : t.publish.submit}
          </button>
          <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {t.publish.reviewNote}
          </span>
        </div>
      </div>
    </div>
  );
}
