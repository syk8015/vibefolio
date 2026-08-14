"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CopyButton from "./CopyButton";
import { CHANNEL_UPLOAD_LINKS } from "@/lib/promo";

export type PostRowData = {
  id: string;
  channel: string;
  caption: string | null;
  status: "draft" | "posted";
  postUrl: string | null;
  trackingUrl: string;
  visits: number;
  signups: number;
};

// 이미 만들어진 포스트(초안 또는 게시완료) 한 줄 — 캡션 편집, 캡션/추적링크
// 복사, 채널 업로드 페이지 바로가기, 게시완료 표시를 한곳에서 처리한다.
export default function PostRow({ post }: { post: PostRowData }) {
  const router = useRouter();
  const [caption, setCaption] = useState(post.caption ?? "");
  const [postUrl, setPostUrl] = useState(post.postUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promo/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resBody.error || `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  const uploadLink = CHANNEL_UPLOAD_LINKS[post.channel];

  return (
    <div className="flex flex-col gap-2 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{post.channel}</span>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              background: post.status === "posted" ? "rgba(46,125,74,0.12)" : "var(--surface-soft)",
              color: post.status === "posted" ? "#2e7d4a" : "var(--text-muted)",
            }}
          >
            {post.status === "posted" ? "게시완료" : "초안"}
          </span>
          {uploadLink && (
            <a
              href={uploadLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline"
              style={{ color: "var(--blue)" }}
            >
              업로드 페이지 열기 ↗
            </a>
          )}
        </div>
        <span className="vf-mono" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
          유입 {post.visits} · 가입 {post.signups}
        </span>
      </div>

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        className="vf-input text-sm"
        style={{ resize: "vertical" }}
        placeholder="캡션"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => patch({ caption })}
          disabled={busy}
          className="px-3 py-1 rounded-full text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", border: "none", cursor: "pointer" }}
        >
          캡션 저장
        </button>
        <CopyButton text={caption} label="캡션 복사" />
        <CopyButton text={post.trackingUrl} label="추적 링크 복사" />
        {post.status !== "posted" && (
          <button
            type="button"
            onClick={() => patch({ status: "posted", postUrl: postUrl || undefined })}
            disabled={busy}
            className="px-3 py-1 rounded-full text-xs font-semibold disabled:opacity-50"
            style={{ background: "var(--blue)", color: "var(--bg)", border: "none", cursor: "pointer" }}
          >
            게시완료로 표시
          </button>
        )}
      </div>

      <input
        value={postUrl}
        onChange={(e) => setPostUrl(e.target.value)}
        onBlur={() => post.postUrl !== postUrl && patch({ postUrl })}
        placeholder="게시물 링크(선택, 참고용 — 집계엔 안 쓰여요)"
        className="vf-input text-xs"
      />

      {error && <p className="text-xs" style={{ color: "#8e3535" }}>{error}</p>}
    </div>
  );
}
