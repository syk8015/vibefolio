"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnalyticsEvent, trackClientEvent } from "@/lib/analytics-client";
import { copyText } from "@/lib/clipboard";
import { useT } from "@/lib/i18n/client";
import { popoverAnchor, type PopoverAnchor } from "./projects/helpers";

// Per-project share affordance, shown in the dashboard row once a video exists
// (the auto-filmed one, or the owner's own directly playable upload).
// A single button opens a small popover with three actions: copy the watch link,
// copy an X post, and download the mp4 (X wants native uploads).
// X 글은 작품이 먼저다(2026-10-04): 사람들은 자기를 멋있게 보이게 하는 걸 올리고,
// 브랜드가 앞서면 안 올린다 — 본문엔 작품 이름·한 줄 소개만, 주소는 답글로
// (X는 본문 링크를 덜 보여 준다). 같은 버튼이 본문 → 답글 주소 순으로 두 번 복사한다.
// 조사: nookframe-작업물/nookframe-research-2026-10-03/share-why/SYNTHESIS.md

function safeFileName(title: string): string {
  const cleaned = title.replace(/[^\w가-힣 .-]/g, "").trim().slice(0, 60);
  return (cleaned || "nookframe-demo") + ".mp4";
}

// 소개글 첫 문장만(길면 자른다) — X 본문은 한눈에 읽혀야 한다.
function firstSentence(text: string, max = 200): string {
  const t = text.replace(/\s+/g, " ").trim();
  const cut = t.match(/^.+?[.!?。](?=\s|$)/)?.[0] ?? t;
  return cut.length > max ? cut.slice(0, max - 1).trimEnd() + "…" : cut;
}

export default function ShareKit({
  username,
  projectId,
  demoVideoUrl,
  projectTitle,
  postTitle,
  postBlurb,
}: {
  username: string;
  projectId: string;
  demoVideoUrl: string;
  projectTitle: string;
  /** X 글에 쓸 이름·소개 — 영어판이 있으면 영어(주 대상이 영어권). */
  postTitle: string;
  postBlurb: string;
}) {
  const { t } = useT();
  // 팝오버는 fixed + body 포털 — 목록 카드(vf-card overflow-hidden)가 absolute
  // 팝오버를 잘라, 작품이 1개뿐이면 메뉴가 카드 밖으로 안 보였다(rows.tsx와 같은 방식).
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const open = anchor !== null;
  const [copied, setCopied] = useState<"link" | "x" | null>(null);
  // X 버튼은 두 단계 — 본문을 복사하면 다음 누름은 답글에 붙일 주소.
  const [xStep, setXStep] = useState<"post" | "reply">("post");
  // 복사가 막히면 그 글을 펼쳐 손으로 복사하게 한다(메뉴를 닫을 때까지 유지).
  const [failedText, setFailedText] = useState<string | null>(null);

  const watchUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${username}/${projectId}`
      : `https://nookframe.com/${username}/${projectId}`;

  // ?via= marks share-link provenance for channel attribution (lib/traffic-source).
  // The watch route ignores unknown query params, and OG scrapers resolve fine.
  const watchShareUrl = `${watchUrl}?via=share`;
  const blurb = firstSentence(postBlurb);
  const xPost = blurb ? `${postTitle} — ${blurb}` : postTitle;
  const xReply = `Watch it run, then try it live: ${watchUrl}?via=x`;

  // 복사가 막힌 곳(인앱 브라우저 등)에서 "복사됨!"이라고 거짓말하지 않는다.
  async function copy(which: "link" | "x", text: string, kind: string): Promise<boolean> {
    const ok = await copyText(text);
    if (!ok) { setFailedText(text); return false; }
    setFailedText(null);
    trackClientEvent(AnalyticsEvent.ShareCopied, { projectId, kind });
    flash(which);
    return true;
  }

  async function copyX() {
    if (xStep === "post") {
      if (await copy("x", xPost, "x_post")) setXStep("reply");
    } else if (await copy("x", xReply, "x_reply")) {
      setXStep("post");
    }
  }

  function flash(which: "link" | "x") {
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1600);
  }

  async function downloadMp4() {
    trackClientEvent(AnalyticsEvent.DemoDownloaded, { projectId });
    try {
      // R2/Supabase are cross-origin; fetch→blob forces a real download (the
      // <a download> attribute is ignored cross-origin). Needs bucket CORS to
      // allow GET from this origin; on failure, fall back to opening the file.
      const res = await fetch(demoVideoUrl);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeFileName(projectTitle);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(demoVideoUrl, "_blank", "noopener");
    }
    setAnchor(null);
  }

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontFamily: "var(--font-nunito)",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={(e) => {
          if (open) { setAnchor(null); return; }
          setFailedText(null);
          setXStep("post");
          trackClientEvent(AnalyticsEvent.ShareOpened, { projectId });
          setAnchor(popoverAnchor(e.currentTarget.getBoundingClientRect(), { width: 220, estHeight: 140, align: "right" }));
        }}
        aria-expanded={open}
        title={t.share.share}
        className="p-2 rounded-full transition-colors"
        style={{ background: open ? "var(--surface-soft-hover)" : "var(--surface-soft)", border: "none", cursor: "pointer" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5V9M7 1.5L4.5 4M7 1.5L9.5 4" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 7.5v3.5A1 1 0 0 0 3.5 12h7a1 1 0 0 0 1-1V7.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {anchor && typeof document !== "undefined" && createPortal(
        <>
          {/* click-away backdrop */}
          <div
            onClick={() => setAnchor(null)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            className="vf-card"
            role="menu"
            style={{
              position: "fixed",
              top: anchor.top,
              left: anchor.left,
              maxHeight: anchor.maxHeight,
              overflowY: "auto",
              zIndex: 50,
              padding: 6,
              width: 220,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
            }}
          >
            <button
              style={itemStyle}
              onClick={() => void copy("link", watchShareUrl, "watch_link")}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconLink />
              {copied === "link" ? t.share.copiedFlash : t.share.copyWatch}
            </button>
            <button
              style={itemStyle}
              onClick={() => void copyX()}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconX />
              {copied === "x" ? t.share.copiedFlash : xStep === "post" ? t.share.copyX : t.share.copyXReply}
            </button>
            <button
              style={itemStyle}
              onClick={downloadMp4}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconDownload />
              {t.share.downloadMp4}
            </button>
            {failedText && (
              <div role="alert" style={{ padding: "6px 8px 4px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "0.875rem", lineHeight: 1.45, color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>
                  {t.share.copyFailed}
                </p>
                <textarea
                  readOnly
                  value={failedText}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ width: "100%", resize: "none", fontSize: "0.8125rem", padding: 6, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-soft)", color: "var(--text-primary)" }}
                />
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

function IconLink() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M5.5 8.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1" stroke="var(--text-secondary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 5.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1" stroke="var(--text-secondary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5v7.5M7 9L4.5 6.5M7 9l2.5-2.5" stroke="var(--text-secondary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11.5h9" stroke="var(--text-secondary)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
