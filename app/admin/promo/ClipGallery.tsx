"use client";

import PostRow, { type PostRowData } from "./PostRow";
import PostComposer from "./PostComposer";

export type ClipData = {
  id: string;
  taglineText: string;
  taglineReply: string | null;
  status: "pending" | "recording" | "done" | "failed";
  videoUrl: string | null;
  posterUrl: string | null;
  error: string | null;
  posts: PostRowData[];
};

const STATUS_LABEL: Record<ClipData["status"], string> = {
  pending: "대기",
  recording: "촬영 중",
  done: "완료",
  failed: "실패",
};

export default function ClipGallery({ clips }: { clips: ClipData[] }) {
  if (clips.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        아직 촬영된 클립이 없어요. 위 태그라인 풀에서 몇 개 골라 큐에 추가한 뒤 `npm run promo:batch`를 돌려주세요.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {clips.map((clip) => (
        <div key={clip.id} className="vf-card p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{clip.taglineText}</p>
              {clip.taglineReply && (
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  <span aria-hidden style={{ opacity: 0.7 }}>↳</span> {clip.taglineReply}
                </p>
              )}
            </div>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
              style={{
                background:
                  clip.status === "done"
                    ? "rgba(46,125,74,0.12)"
                    : clip.status === "failed"
                      ? "rgba(179,71,71,0.12)"
                      : "var(--surface-soft)",
                color: clip.status === "done" ? "#2e7d4a" : clip.status === "failed" ? "#8e3535" : "var(--text-muted)",
              }}
            >
              {STATUS_LABEL[clip.status]}
            </span>
          </div>

          {clip.status === "done" && clip.videoUrl && (
            <video
              controls
              poster={clip.posterUrl ?? undefined}
              src={clip.videoUrl}
              style={{ width: "100%", maxWidth: 220, borderRadius: 12, background: "#000" }}
            />
          )}
          {clip.status === "failed" && clip.error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(179,71,71,0.08)", color: "#8e3535" }}>
              {clip.error}
            </p>
          )}

          {clip.status === "done" && (
            <div className="flex flex-col gap-1">
              {clip.posts.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
              <PostComposer clipId={clip.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
