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
// 클립 하나에 여러 줄이 쌓이므로 **세로 공간을 아끼는 게 우선**: 헤더 한 줄 +
// 캡션 한 줄이 기본이고, 게시물 링크처럼 가끔 쓰는 칸은 "더보기"로 접어둔다.
export default function PostRow({ post }: { post: PostRowData }) {
  const router = useRouter();
  const [caption, setCaption] = useState(post.caption ?? "");
  const [postUrl, setPostUrl] = useState(post.postUrl ?? "");
  const [expanded, setExpanded] = useState(false);
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
  const dirty = caption !== (post.caption ?? "");

  return (
    <div className="flex flex-col gap-1.5 py-2" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{post.channel}</span>
        <span
          className="px-1.5 py-0.5 rounded-full font-semibold"
          style={{
            fontSize: "0.62rem",
            background: post.status === "posted" ? "rgba(46,125,74,0.12)" : "var(--surface-soft)",
            color: post.status === "posted" ? "#2e7d4a" : "var(--text-muted)",
          }}
        >
          {post.status === "posted" ? "게시완료" : "초안"}
        </span>
        <span className="vf-mono" style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
          유입 {post.visits} · 가입 {post.signups}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto rounded-full px-2 py-0.5 font-semibold"
          style={{
            fontSize: "0.62rem",
            background: "transparent",
            color: "var(--text-muted)",
            border: "none",
            cursor: "pointer",
          }}
        >
          {expanded ? "접기" : "더보기"}
        </button>
      </div>

      <div className="flex items-start gap-1.5">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={expanded ? 3 : 1}
          className="vf-input vf-input-compact flex-1"
          style={{ resize: "vertical" }}
          placeholder="캡션"
        />
        <div className="flex flex-col gap-1 shrink-0">
          <CopyButton text={caption} label="캡션" compact />
          <CopyButton text={post.trackingUrl} label="링크" compact />
        </div>
      </div>

      {expanded && (
        <>
          <input
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            onBlur={() => post.postUrl !== postUrl && patch({ postUrl })}
            placeholder="게시물 링크(선택, 참고용 — 집계엔 안 쓰여요)"
            className="vf-input vf-input-compact"
          />
          {uploadLink && (
            <a
              href={uploadLink}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ fontSize: "0.68rem", color: "var(--blue)" }}
            >
              {post.channel} 업로드 페이지 열기 ↗
            </a>
          )}
        </>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {dirty && (
          <button
            type="button"
            onClick={() => patch({ caption })}
            disabled={busy}
            className="px-2.5 py-1 rounded-full font-semibold disabled:opacity-50"
            style={{
              fontSize: "0.68rem",
              background: "var(--surface-soft)",
              color: "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            캡션 저장
          </button>
        )}
        {post.status !== "posted" && (
          <button
            type="button"
            onClick={() => patch({ status: "posted", postUrl: postUrl || undefined })}
            disabled={busy}
            className="px-2.5 py-1 rounded-full font-semibold disabled:opacity-50"
            style={{
              fontSize: "0.68rem",
              background: "var(--blue)",
              color: "var(--bg)",
              border: "none",
              cursor: "pointer",
            }}
          >
            게시완료로 표시
          </button>
        )}
        {error && <p style={{ fontSize: "0.68rem", color: "#8e3535" }}>{error}</p>}
      </div>
    </div>
  );
}
