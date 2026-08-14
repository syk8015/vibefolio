"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROMO_CHANNEL_HINTS } from "@/lib/promo";

// 클립을 새 채널에 등록하는 미니폼 — 채널은 datalist로 자동완성 힌트를 주되
// 자유 텍스트 입력을 그대로 허용한다(커뮤니티 채널 확장 요구사항).
export default function PostComposer({ clipId }: { clipId: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState("");
  const [caption, setCaption] = useState("");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateCaption() {
    if (!channel.trim()) {
      setError("채널을 먼저 입력해 주세요.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId, channel: channel.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setCaption(body.caption);
    } catch (err) {
      setError(err instanceof Error ? err.message : "캡션 생성에 실패했어요.");
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    if (!channel.trim()) {
      setError("채널을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId, channel: channel.trim(), caption }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setChannel("");
      setCaption("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "포스트 생성에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="flex items-center gap-2">
        <input
          list="promo-channel-hints"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="채널 (예: 인스타 릴스, 새 커뮤니티명…)"
          className="vf-input text-sm flex-1"
        />
        <datalist id="promo-channel-hints">
          {PROMO_CHANNEL_HINTS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={generateCaption}
          disabled={generating}
          className="px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 disabled:opacity-50"
          style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", border: "none", cursor: "pointer" }}
        >
          {generating ? "생성 중…" : "캡션 생성"}
        </button>
      </div>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        placeholder="캡션 생성 버튼을 누르거나 직접 입력"
        className="vf-input text-sm"
        style={{ resize: "vertical" }}
      />
      <div className="flex items-center justify-between gap-2">
        {error && <p className="text-xs" style={{ color: "#8e3535" }}>{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="ml-auto px-4 py-1.5 rounded-full text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--blue)", color: "var(--bg)", border: "none", cursor: "pointer" }}
        >
          {submitting ? "만드는 중…" : "포스트 만들기"}
        </button>
      </div>
    </div>
  );
}
