"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROMO_CHANNEL_HINTS } from "@/lib/promo";

// 클립을 새 채널에 등록하는 미니폼 — 채널은 datalist로 자동완성 힌트를 주되
// 자유 텍스트 입력을 그대로 허용한다(커뮤니티 채널 확장 요구사항).
// 기본은 버튼 한 줄로 접혀 있다: 클립 카드가 목록에 여러 개 깔리므로 항상
// 펼쳐 두면 세로 공간을 너무 먹는다.
// 캡션 AI 생성은 제거됨(2026-08-18 사용자 결정 — 캡션은 직접 쓴다).
export default function PostComposer({ clipId }: { clipId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "포스트 생성에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-2.5 py-1 rounded-full font-semibold mt-1"
        style={{
          fontSize: "0.68rem",
          background: "var(--surface-soft)",
          color: "var(--text-secondary)",
          border: "none",
          cursor: "pointer",
        }}
      >
        + 채널 추가
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: "1px dashed var(--border)" }}>
      <input
        list="promo-channel-hints"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        placeholder="채널 (예: 인스타 릴스, 새 커뮤니티명…)"
        className="vf-input vf-input-compact"
      />
      <datalist id="promo-channel-hints">
        {PROMO_CHANNEL_HINTS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        placeholder="캡션 (직접 입력)"
        className="vf-input vf-input-compact"
        style={{ resize: "vertical" }}
      />
      <div className="flex items-center gap-1.5">
        {error && <p style={{ fontSize: "0.68rem", color: "#8e3535" }}>{error}</p>}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto px-2.5 py-1 rounded-full font-semibold"
          style={{
            fontSize: "0.68rem",
            background: "transparent",
            color: "var(--text-muted)",
            border: "none",
            cursor: "pointer",
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1 rounded-full font-semibold disabled:opacity-50"
          style={{
            fontSize: "0.68rem",
            background: "var(--blue)",
            color: "var(--bg)",
            border: "none",
            cursor: "pointer",
          }}
        >
          {submitting ? "만드는 중…" : "포스트 만들기"}
        </button>
      </div>
    </div>
  );
}
