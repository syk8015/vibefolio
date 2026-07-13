// Nookframe transactional email templates (T4).
//
// Pure functions — no env, no framework imports — so the tsx worker, API routes
// and the cron watchdog all render identical mail. Each returns { subject, html }.
//
// Visual language: paper & ink, soft-fill (no 1px borders), single LIGHT theme —
// email clients don't do CSS vars or prefers-color-scheme reliably, so the
// palette is inlined from app/globals.css light values. Table layout + inline
// styles only (Gmail strips <style> in enough cases to not bother).
//
// Copy voice: product 요-form with periods (dashboard tone), NOT the landing
// tagline pools. User-supplied strings (titles, reasons) are escaped.

const SITE_URL = "https://nookframe.com";

// globals.css light theme, inlined.
const INK = "#1a1612";
const CREAM = "#fdfaf3";
const SOFT = "#f3ecd9";
const MUTED = "#6a5e4e";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Clamp untrusted strings that land in a subject line.
function clampSubject(s: string, max = 60): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// Poster JPG lives next to the demo mp4 under a deterministic key. This mirrors
// lib/portfolio.ts posterFromDemo — duplicated because portfolio.ts imports
// next/cache and this module must stay worker-safe. Keep the regex in sync.
export function posterFromDemoUrl(videoUrl: string | null | undefined): string | undefined {
  if (!videoUrl) return undefined;
  const m = videoUrl.match(/^(.*)\/demo(-\d+)?\.mp4/);
  if (!m) return undefined;
  return `${m[1]}/poster${m[2] ?? ""}.jpg`;
}

function button(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank"
    style="display:inline-block;background:${INK};color:${CREAM};text-decoration:none;
    font-family:${FONT};font-size:14px;font-weight:700;line-height:1;
    padding:13px 26px;border-radius:999px;">${escapeHtml(label)}</a>`;
}

// Shared shell: soft paper backdrop, one cream card, wordmark, footer.
// preheader = inbox preview line (hidden in the body).
function shell(preheader: string, content: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${SOFT};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <tr><td style="padding:0 8px 16px;">
        <span style="font-family:${FONT};font-size:15px;font-weight:800;letter-spacing:0.02em;color:${INK};">Nookframe</span>
      </td></tr>
      <tr><td style="background:${CREAM};border-radius:20px;padding:36px 32px;">
        ${content}
      </td></tr>
      <tr><td style="padding:18px 8px 0;">
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
          Nookframe 자동 알림이에요. 궁금한 점은 이 메일에 회신해 주세요.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${FONT};font-size:20px;line-height:1.4;font-weight:800;color:${INK};">${escapeHtml(text)}</h1>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:1.7;color:${INK};">${html}</p>`;
}

function mutedLine(html: string): string {
  return `<p style="margin:16px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.7;color:${MUTED};">${html}</p>`;
}

export type RenderedEmail = { subject: string; html: string };

// ── 시연 완성 — 바이럴 루프의 복귀 지점 ───────────────────────────────────────
// 유저는 촬영을 요청하고 떠났다가 이 메일로 돌아온다. CTA는 watch 페이지(감상 +
// 공유 대상 링크), 서브는 대시보드의 Share Kit(mp4 다운로드·문구 복사).
export function demoReadyEmail(input: {
  projectTitle: string;
  watchUrl: string;
  posterUrl?: string;
}): RenderedEmail {
  const title = escapeHtml(input.projectTitle);
  const poster = input.posterUrl
    ? `<a href="${escapeHtml(input.watchUrl)}" target="_blank" style="display:block;margin:0 0 20px;">
        <img src="${escapeHtml(input.posterUrl)}" width="496" alt="${title} 시연 영상 첫 장면"
          style="display:block;width:100%;max-width:496px;border-radius:14px;" />
      </a>`
    : "";
  return {
    subject: `시연 영상이 완성됐어요 — ${clampSubject(input.projectTitle)}`,
    html: shell(
      `${input.projectTitle} 자동 시연 영상이 방금 완성됐어요.`,
      [
        heading("시연 영상이 완성됐어요"),
        paragraph(`<strong>${title}</strong>의 자동 시연 영상이 방금 완성됐어요. 사람 손 없이, 배포된 화면 그대로 촬영됐어요.`),
        poster,
        button("영상 보러 가기", input.watchUrl),
        mutedLine(
          `링크를 그대로 공유하면 Discord·Slack에서 영상이 바로 재생돼요. mp4 다운로드와 공유 문구는 <a href="${SITE_URL}/dashboard" target="_blank" style="color:${MUTED};">대시보드의 공유 버튼</a>에 있어요.`,
        ),
      ].join("\n"),
    ),
  };
}

// ── 시연 실패 — 이탈 후 통보 (P0.6 ④) ────────────────────────────────────────
// 코드별 카피는 대시보드 배지와 같은 표(DEMO_FAILURE_COPY)를 쓴다. raw 에러는
// 메일에 싣지 않는다 — 기술 정보는 대시보드 팝오버 토글에서.
export function demoFailedEmail(input: {
  projectTitle: string;
  copy: { title: string; body: string };
}): RenderedEmail {
  return {
    subject: `시연 영상을 만들지 못했어요 — ${clampSubject(input.projectTitle)}`,
    html: shell(
      input.copy.title,
      [
        heading(input.copy.title),
        paragraph(
          `<strong>${escapeHtml(input.projectTitle)}</strong>의 자동 시연 촬영이 완료되지 못했어요.`,
        ),
        paragraph(escapeHtml(input.copy.body)),
        button("대시보드에서 다시 시도", `${SITE_URL}/dashboard`),
        mutedLine("자세한 기술 정보는 대시보드의 실패 배지를 누르면 볼 수 있어요."),
      ].join("\n"),
    ),
  };
}

// ── 운영 경보 (관리자 수신) — 크레딧 소진·워치독·승인 대기 공용 ─────────────────
export function adminAlertEmail(input: {
  title: string;
  lines: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}): RenderedEmail {
  const items = input.lines
    .map(
      (l) =>
        `<li style="margin:0 0 6px;font-family:${FONT};font-size:13.5px;line-height:1.7;color:${INK};">${escapeHtml(l)}</li>`,
    )
    .join("\n");
  return {
    subject: `[Nookframe] ${clampSubject(input.title, 80)}`,
    html: shell(
      input.title,
      [
        heading(input.title),
        `<ul style="margin:0 0 20px;padding-left:18px;">${items}</ul>`,
        input.ctaLabel && input.ctaUrl ? button(input.ctaLabel, input.ctaUrl) : "",
      ].join("\n"),
    ),
  };
}

export { SITE_URL };
