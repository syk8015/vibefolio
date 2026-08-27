"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { copyText } from "@/lib/clipboard";
import { getSocialBrand } from "@/components/SocialBadge";
import { PROMO_CHANNELS, PROMO_OPENINGS, type PromoOpening } from "@/lib/promo";

export type ClipPost = {
  id: string;
  channel: string;
  trackingUrl: string;
  visits: number;
  signups: number;
};

export type ClipData = {
  id: string;
  taglineText: string;
  taglineReply: string | null;
  caption: string | null;
  status: "pending" | "recording" | "done" | "failed";
  format: "vertical" | "horizontal";
  opening: PromoOpening;
  videoUrl: string | null;
  posterUrl: string | null;
  error: string | null;
  posts: ClipPost[];
  // 이 클립의 모든 채널 합계.
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

// 미리보기 폭. 예전엔 96px였는데 그러면 크롬이 재생·전체화면 버튼을 숨겨서
// 클립을 확인할 수가 없다(2026-08-27 사용자 지적) — 컨트롤 바가 온전히 나오는
// 크기로 키웠다. 여기서 더 줄이지 말 것.
const PREVIEW_W: Record<ClipData["format"], number> = { vertical: 208, horizontal: 300 };

/**
 * 클립 한 장 = 영상 + 캡션 하나 + SNS 로고 버튼 4개.
 *
 * 구조는 사용자가 직접 정했다(2026-08-27): 위=문구·성적·상태, 가운데=캡션 쓰는
 * 칸 하나, 아래=채널 바로가기 버튼. 예전의 "채널 추가 폼 → 채널마다 캡션 줄"
 * 구조는 폐기했다 — 어차피 캡션은 채널이 달라도 같은 걸 쓰는데 줄만 쌓였다.
 *
 * 버튼 한 번 = 이 채널에 올린다:
 *   캡션 저장 → (없으면) 그 채널 포스트 생성 → 캡션+추적링크 클립보드 복사 →
 *   업로드 페이지 새 탭. 추적링크는 포스트를 만들어야 발급되므로(campaign =
 *   promo-{postId}) 이 순서를 바꾸면 링크 없는 캡션이 복사된다.
 */
export default function ClipCard({ clip }: { clip: ClipData }) {
  const router = useRouter();
  const [caption, setCaption] = useState(clip.caption ?? "");
  const [busyChannel, setBusyChannel] = useState<string | null>(null);
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const w = PREVIEW_W[clip.format];
  const h = clip.format === "vertical" ? Math.round((w * 16) / 9) : Math.round((w * 9) / 16);
  const openingLabel = PROMO_OPENINGS[clip.opening]?.label ?? clip.opening;

  async function saveCaption(next: string) {
    const res = await fetch(`/api/admin/promo/clips/${clip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
  }

  async function handleCaptionBlur() {
    if (caption === (clip.caption ?? "")) return;
    try {
      await saveCaption(caption);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "캡션 저장에 실패했어요.");
    }
  }

  async function handleChannel(channel: string, uploadUrl: string) {
    setBusyChannel(channel);
    setError(null);
    try {
      if (caption !== (clip.caption ?? "")) await saveCaption(caption);

      let post = clip.posts.find((p) => p.channel === channel);
      if (!post) {
        const res = await fetch("/api/admin/promo/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clipId: clip.id, channel, caption, status: "posted" }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        post = { id: body.postId, channel, trackingUrl: body.trackingUrl, visits: 0, signups: 0 };
      }

      const payload = [caption.trim(), post.trackingUrl].filter(Boolean).join("\n\n");
      const copied = await copyText(payload);
      if (copied) {
        setCopiedChannel(channel);
        setTimeout(() => setCopiedChannel(null), 2200);
      }
      // 새 탭이 팝업 차단에 걸릴 수 있어(비동기 뒤 open) 실패를 조용히 넘기지
      // 않고 알려준다 — 복사는 이미 됐으므로 주소만 직접 열면 된다.
      const win = window.open(uploadUrl, "_blank", "noopener,noreferrer");
      if (!win) setError(`팝업이 막혔어요. ${uploadUrl} 를 직접 열어주세요 (캡션은 복사됨).`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "실패했어요.");
    } finally {
      setBusyChannel(null);
    }
  }

  async function handleRemove(post: ClipPost) {
    setBusyChannel(post.channel);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promo/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "취소에 실패했어요.");
    } finally {
      setBusyChannel(null);
    }
  }

  // 고정 4채널 + 옛 기록에만 있는 채널(이름이 다르게 저장된 것)을 뒤에 붙인다.
  const extraPosts = clip.posts.filter((p) => !PROMO_CHANNELS.some((c) => c.label === p.channel));

  return (
    <div className="vf-card p-3 flex gap-4 items-start">
      {/* 왼쪽: 미리보기 — 상태와 무관하게 같은 자리를 차지해 목록 줄이 흔들리지 않는다. */}
      <div className="shrink-0" style={{ width: w }}>
        {clip.status === "done" && clip.videoUrl ? (
          <video
            controls
            preload="none"
            poster={clip.posterUrl ?? undefined}
            src={clip.videoUrl}
            style={{ width: w, height: h, borderRadius: 12, background: "#000", objectFit: "cover" }}
          />
        ) : (
          <div
            className="flex items-center justify-center text-center"
            style={{
              width: w,
              height: h,
              borderRadius: 12,
              background: "var(--surface-soft)",
              color: "var(--text-muted)",
              fontSize: "0.75rem",
            }}
          >
            {STATUS_LABEL[clip.status]}
          </div>
        )}
      </div>

      {/* 오른쪽: 문구 → 캡션 → 채널 버튼 */}
      <div className="min-w-0 flex-1 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {clip.taglineText}
            </p>
            {clip.taglineReply && (
              <p className="truncate" style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                <span aria-hidden style={{ opacity: 0.7 }}>↳</span> {clip.taglineReply}
              </p>
            )}
            <p className="vf-mono mt-0.5" style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
              {FORMAT_LABEL[clip.format]} · {openingLabel}
            </p>
          </div>
          {clip.posts.length > 0 && (
            <span
              className="vf-mono shrink-0"
              style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
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
              color: clip.status === "done" ? "#2e7d4a" : clip.status === "failed" ? "#8e3535" : "var(--text-muted)",
            }}
          >
            {STATUS_LABEL[clip.status]}
          </span>
        </div>

        {clip.status === "failed" && clip.error && (
          <p
            className="px-2 py-1 rounded-lg"
            style={{ fontSize: "0.68rem", background: "rgba(179,71,71,0.08)", color: "#8e3535" }}
          >
            {clip.error}
          </p>
        )}

        {clip.status === "done" && (
          <>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={handleCaptionBlur}
              rows={3}
              className="vf-input"
              style={{ resize: "vertical", fontSize: "0.82rem" }}
              placeholder="캡션 — 올릴 때 이 글이 추적 링크와 함께 복사돼요."
            />

            <div className="flex items-center gap-1.5 flex-wrap">
              {PROMO_CHANNELS.map((ch) => {
                const post = clip.posts.find((p) => p.channel === ch.label);
                return (
                  <ChannelPill
                    key={ch.label}
                    label={ch.label}
                    host={ch.host}
                    post={post}
                    busy={busyChannel === ch.label}
                    copied={copiedChannel === ch.label}
                    onClick={() => handleChannel(ch.label, ch.uploadUrl)}
                    onRemove={post ? () => handleRemove(post) : undefined}
                  />
                );
              })}
              {extraPosts.map((post) => (
                <ChannelPill
                  key={post.id}
                  label={post.channel}
                  host={null}
                  post={post}
                  busy={busyChannel === post.channel}
                  copied={copiedChannel === post.channel}
                  onClick={() => copyText([caption.trim(), post.trackingUrl].filter(Boolean).join("\n\n"))}
                  onRemove={() => handleRemove(post)}
                />
              ))}
            </div>
          </>
        )}

        {error && <p style={{ fontSize: "0.68rem", color: "#8e3535" }}>{error}</p>}
      </div>
    </div>
  );
}

// 명함(SocialBadge)의 알약 배지와 같은 모양 — 로고 원 + 이름. 올린 채널은
// 브랜드 색이 들어오고 그 채널 성적이 붙는다. 아직 안 올린 채널은 회색.
function ChannelPill({
  label,
  host,
  post,
  busy,
  copied,
  onClick,
  onRemove,
}: {
  label: string;
  host: string | null;
  post?: ClipPost;
  busy: boolean;
  copied: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const brand = host ? getSocialBrand(host) : null;
  const posted = !!post;
  // 숫자가 붙기 시작한 채널은 지우면 유입 기록이 같이 날아간다 — 0일 때만 취소.
  const canRemove = !!onRemove && posted && post.visits === 0 && post.signups === 0;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={posted ? `${label}에 올림 — 다시 누르면 캡션+링크를 또 복사해요` : `${label}에 올리기`}
        className="inline-flex items-center gap-2 transition-opacity hover:opacity-75 disabled:opacity-50"
        style={{
          borderRadius: "999px",
          padding: "5px 12px 5px 6px",
          background: posted ? "var(--surface-soft)" : "transparent",
          border: `1px solid ${posted ? "transparent" : "var(--border-bright)"}`,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        <span
          className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{
            width: 22,
            height: 22,
            background: posted ? (brand?.color ?? "var(--text-muted)") : "var(--text-muted)",
            opacity: posted ? 1 : 0.35,
          }}
        >
          {brand?.icon ?? <span style={{ fontSize: "0.6rem", color: "#fff" }}>·</span>}
        </span>
        <span
          className="font-semibold"
          style={{ fontSize: "0.72rem", color: posted ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {copied ? "복사됨" : label}
        </span>
        {posted && (
          <span
            className="vf-mono"
            style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}
          >
            {post.visits}·{post.signups}
          </span>
        )}
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`${label} 기록 취소`}
          className="absolute flex items-center justify-center rounded-full"
          style={{
            top: -5,
            right: -5,
            width: 16,
            height: 16,
            fontSize: "0.62rem",
            lineHeight: 1,
            background: "var(--surface-soft-hover)",
            color: "var(--text-muted)",
            border: "none",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}
