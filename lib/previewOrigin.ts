// Untrusted, user-uploaded project files are served via `/api/preview/*`. Their
// HTML/JS must run on a SEPARATE origin from the main app — otherwise scripts in
// an uploaded project can read nookframe.com cookies / localStorage and steal a
// logged-in visitor's Supabase session (account takeover).
//
// We point all preview content at a sandbox origin (the project's *.vercel.app
// canonical domain — a different origin, and on the Public Suffix List, so it
// shares no cookies with the apex domain). Configure via env:
//
//   NEXT_PUBLIC_PREVIEW_ORIGIN=https://<project>.vercel.app
//
// If unset (e.g. local dev), preview URLs fall back to the same origin so the app
// still works — but the isolation guarantee only holds once it is set in prod.
export const PREVIEW_ORIGIN = (
  process.env.NEXT_PUBLIC_PREVIEW_ORIGIN ?? ""
).replace(/\/+$/, "");

// Canonical app origin. The sandbox host serves ONLY /api/preview/* (enforced in
// middleware); any other path that lands there is bounced back here. Also the sole
// allowed frame-ancestor for uploaded HTML (the app embeds it cross-origin).
// Override via env if the canonical domain ever changes.
export const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://nookframe.com"
).replace(/\/+$/, "");

/** True for our own uploaded-project preview paths (vs. external demo URLs). */
function isPreviewPath(url: string | null | undefined): url is string {
  return !!url && url.startsWith("/api/preview/");
}

/**
 * Resolve a demo URL for embedding/opening.
 * - External http(s) demo URLs pass through unchanged.
 * - Our `/api/preview/...` paths are rewritten onto the sandbox origin so they
 *   never execute under the main app origin (iframe, new tab, or direct nav).
 * - When no sandbox origin is configured, returns the path as-is (same origin).
 */
export function toPreviewUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!isPreviewPath(url)) return url;
  if (!PREVIEW_ORIGIN) return url;
  return `${PREVIEW_ORIGIN}${url}`;
}
