"use client";

import PostRow, { type PostRowData } from "./PostRow";
import PostComposer from "./PostComposer";
import { PROMO_OPENINGS, type PromoOpening } from "@/lib/promo";

export type ClipData = {
  id: string;
  taglineText: string;
  taglineReply: string | null;
  status: "pending" | "recording" | "done" | "failed";
  format: "vertical" | "horizontal";
  opening: PromoOpening;
  videoUrl: string | null;
  posterUrl: string | null;
  error: string | null;
  posts: PostRowData[];
  // 이 클립의 모든 포스트 합계(채널이 여러 개면 다 더한 값).
  visits: number;
  signups: number;
};

const FORMAT_LABEL: Record<ClipData["format"], string> = {
  vertical: "세로 9:16",
  horizontal: "가로 16:9",
};

const STATUS_LABEL: Record<ClipData["status"], string> = {
  pending: "대기",
  recording: "촬영 중",
  done: "완료",
  failed: "실패",
};

// 미리보기 폭. 세로 클립을 크게 두면 카드 한 장이 400px 넘게 차지해서 목록이
// 금방 길어진다 — 작게 두고 채널·캡션은 **영상 오른쪽**에 붙인다(2026-08-18
// 사용자 요청). 클릭하면 브라우저 전체화면으로 크게 볼 수 있다.
const PREVIEW_W: Record<ClipData["format"], number> = { vertical: 96, horizontal: 168 };

export default function ClipGallery({ clips }: { clips: ClipData[] }) {
  if (clips.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        아직 촬영된 클립이 없어요. 위 태그라인 풀에서 몇 개 골라 큐에 추가한 뒤 `npm run promo:batch`를 돌려주세요.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
      {clips.map((clip) => {
        const w = PREVIEW_W[clip.format];
        const h = clip.format === "vertical" ? Math.round((w * 16) / 9) : Math.round((w * 9) / 16);
        return (
          <div key={clip.id} className="vf-card p-3 flex gap-3 items-start">
            {/* 왼쪽: 미리보기 — 상태에 상관없이 같은 자리를 차지해 목록 줄이 흔들리지 않는다. */}
            <div className="shrink-0 flex flex-col gap-1" style={{ width: w }}>
              {clip.status === "done" && clip.videoUrl ? (
                <video
                  controls
                  preload="none"
                  poster={clip.posterUrl ?? undefined}
                  src={clip.videoUrl}
                  style={{ width: w, height: h, borderRadius: 10, background: "#000", objectFit: "cover" }}
                />
              ) : (
                <div
                  className="flex items-center justify-center text-center"
                  style={{
                    width: w,
                    height: h,
                    borderRadius: 10,
                    background: "var(--surface-soft)",
                    color: "var(--text-muted)",
                    fontSize: "0.68rem",
                  }}
                >
                  {STATUS_LABEL[clip.status]}
                </div>
              )}
              <span className="vf-mono text-center" style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                {FORMAT_LABEL[clip.format]} · {PROMO_OPENINGS[clip.opening]?.label ?? clip.opening}
              </span>
            </div>

            {/* 오른쪽: 문구 + 업로드 기록 */}
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-semibold"
                    style={{
                      color: "var(--text-primary)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {clip.taglineText}
                  </p>
                  {clip.taglineReply && (
                    <p className="truncate" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      <span aria-hidden style={{ opacity: 0.7 }}>↳</span> {clip.taglineReply}
                    </p>
                  )}
                </div>
                {clip.status === "done" && clip.posts.length > 0 && (
                  <span
                    className="vf-mono shrink-0"
                    style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
                  >
                    유입 {clip.visits} · 가입 {clip.signups}
                  </span>
                )}
                <span
                  className="px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                  style={{
                    fontSize: "0.62rem",
                    background:
                      clip.status === "done"
                        ? "rgba(46,125,74,0.12)"
                        : clip.status === "failed"
                          ? "rgba(179,71,71,0.12)"
                          : "var(--surface-soft)",
                    color:
                      clip.status === "done" ? "#2e7d4a" : clip.status === "failed" ? "#8e3535" : "var(--text-muted)",
                  }}
                >
                  {STATUS_LABEL[clip.status]}
                </span>
              </div>

              {clip.status === "failed" && clip.error && (
                <p
                  className="mt-1.5 px-2 py-1 rounded-lg"
                  style={{ fontSize: "0.68rem", background: "rgba(179,71,71,0.08)", color: "#8e3535" }}
                >
                  {clip.error}
                </p>
              )}

              {clip.status === "done" && (
                <div className="flex flex-col mt-1">
                  {clip.posts.map((post) => (
                    <PostRow key={post.id} post={post} />
                  ))}
                  <PostComposer clipId={clip.id} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
