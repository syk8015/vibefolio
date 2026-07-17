"use client";

import { useState } from "react";
import { AnalyticsEvent, trackClientEvent } from "@/lib/analytics-client";

// Per-project share affordance, shown in the dashboard row once a demo exists.
// A single button opens a small popover with three actions: copy the watch link,
// copy an X post (English — the mp4 is the viral carrier and X wants native
// uploads), and download the mp4. UI labels stay Korean; only the copied text is
// English.

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function safeFileName(title: string): string {
  const cleaned = title.replace(/[^\w가-힣 .-]/g, "").trim().slice(0, 60);
  return (cleaned || "nookframe-demo") + ".mp4";
}

export default function ShareKit({
  username,
  projectId,
  demoVideoUrl,
  projectTitle,
}: {
  username: string;
  projectId: string;
  demoVideoUrl: string;
  projectTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"link" | "x" | null>(null);

  const watchUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${username}/${projectId}`
      : `https://nookframe.com/${username}/${projectId}`;

  // ?via= marks share-link provenance for channel attribution (lib/traffic-source).
  // The watch route ignores unknown query params, and OG scrapers resolve fine.
  const watchShareUrl = `${watchUrl}?via=share`;
  const xText = `${projectTitle} — no human recorded this. Nookframe filmed it straight from the live app.\n\n${watchUrl}?via=x`;

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
    setOpen(false);
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
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => {
          if (!open) trackClientEvent(AnalyticsEvent.ShareOpened, { projectId });
          setOpen(!open);
        }}
        title="공유"
        className="p-2 rounded-full transition-colors"
        style={{ background: open ? "var(--surface-soft-hover)" : "var(--surface-soft)", border: "none", cursor: "pointer" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5V9M7 1.5L4.5 4M7 1.5L9.5 4" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 7.5v3.5A1 1 0 0 0 3.5 12h7a1 1 0 0 0 1-1V7.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            className="vf-card"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 41,
              padding: 6,
              minWidth: 190,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
            }}
          >
            <button
              style={itemStyle}
              onClick={async () => {
                await copyText(watchShareUrl);
                trackClientEvent(AnalyticsEvent.ShareCopied, { projectId, kind: "watch_link" });
                flash("link");
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconLink />
              {copied === "link" ? "복사됨!" : "watch 링크 복사"}
            </button>
            <button
              style={itemStyle}
              onClick={async () => {
                await copyText(xText);
                trackClientEvent(AnalyticsEvent.ShareCopied, { projectId, kind: "x_post" });
                flash("x");
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconX />
              {copied === "x" ? "복사됨!" : "X 공유문구 복사"}
            </button>
            <button
              style={itemStyle}
              onClick={downloadMp4}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <IconDownload />
              mp4 다운로드
            </button>
          </div>
        </>
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
