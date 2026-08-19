"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import LanguageToggle from "@/components/LanguageToggle";

export default function PublishForm() {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useT();

  async function submit() {
    setError(null);
    const trimmed = raw.trim();
    if (!trimmed) {
      setError(t.publish.errors.empty);
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      setError(
        /^https?:\/\//i.test(trimmed)
          ? t.publish.errors.urlOnly
          : t.publish.errors.invalidJson,
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t.publish.errors.submitFailed);
        setSubmitting(false);
        return;
      }
      router.push(`/dashboard?review=${body.projectId}`);
    } catch {
      setError(t.publish.errors.network);
      setSubmitting(false);
    }
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
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
          {t.publish.intro} {t.publish.promptHintBefore}
          <Link href="/dashboard" style={{ color: "var(--text-primary)", textDecoration: "underline" }}>{t.publish.promptHintLink}</Link>
          {t.publish.promptHintAfter}
        </p>

        <textarea
          className="vf-input w-full"
          style={{ minHeight: 220, fontFamily: "var(--font-mono), monospace", fontSize: "0.85rem", lineHeight: 1.6 }}
          placeholder={'{\n  "title": "...",\n  "description": "...",\n  "demoScript": { "steps": [{ "goal": "...", "where": "...", "action": "click", "expect": "..." }] },\n  "tags": ["Claude Code"],\n  "contentType": "web-app",\n  "deployUrl": "https://..."\n}'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />

        {error && (
          <p className="text-sm mt-3" style={{ color: "var(--danger, #c0392b)", fontFamily: "var(--font-nunito)" }}>{error}</p>
        )}

        <div className="flex items-center gap-3 mt-5">
          <button onClick={submit} disabled={submitting} className="vf-button-primary" style={{ opacity: submitting ? 0.6 : 1 }}>
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
