"use client";

import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile (T6 signup-bot gate) — explicit-render widget for the
// auth forms. Wholly gated on NEXT_PUBLIC_TURNSTILE_SITE_KEY: with the env
// absent this renders nothing and the forms submit without a token, so the
// code is deploy-safe before the key exists. Enforcement lives in Supabase
// (Auth > Attack protection > CAPTCHA, Turnstile secret) — once that's on,
// signUp / signInWithPassword / resetPasswordForEmail all REQUIRE the token,
// which is why all three forms mount this. OAuth (Google) is not captcha-gated
// by Supabase. Setup steps: docs/turnstile-setup.md.

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __nfTurnstileOnload?: () => void;
  }
}

const LOAD_TIMEOUT_MS = 10000;

let loadPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      window.__nfTurnstileOnload = () => { settled = true; resolve(); };
      const s = document.createElement("script");
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__nfTurnstileOnload&render=explicit";
      s.async = true;
      // Without onerror + a timeout, a blocked or hung script (ad-blocker, offline,
      // CDN outage) leaves this promise pending forever. The widget never renders, the
      // token never arrives, and the submit button — gated on `!captchaToken` — stays
      // disabled with no explanation: a permanent lockout of login/signup/reset.
      s.onerror = () => { if (!settled) reject(new Error("turnstile: script load failed")); };
      window.setTimeout(() => { if (!settled) reject(new Error("turnstile: load timed out")); }, LOAD_TIMEOUT_MS);
      document.head.appendChild(s);
    });
    // Drop the memo on failure so a retry (or a later mount) can attempt a fresh load.
    loadPromise.catch(() => { loadPromise = null; });
  }
  return loadPromise;
}

/** Call after a submit attempt consumed the token (success or error) — tokens are single-use. */
export function resetTurnstile() {
  try {
    window.turnstile?.reset();
  } catch {
    // widget already gone — nothing to reset
  }
}

export default function TurnstileWidget({
  onToken,
}: {
  /** Fires with the token when solved, and null when it expires/errors/fails to load. */
  onToken: (token: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onToken);
  // Keep the latest callback without re-running the render effect (mutating a ref
  // during render trips react-hooks/refs). The Turnstile callbacks read cbRef.current
  // at solve time, well after this settles.
  useEffect(() => { cbRef.current = onToken; }, [onToken]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!turnstileEnabled) return;
    const el = ref.current;
    if (!el) return;
    let widgetId: string | null = null;
    let cancelled = false;
    setFailed(false);

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        // The site's theme toggle stamps data-theme on <html>; "auto" would only
        // follow the OS preference and could mismatch a manual toggle.
        const stamped = document.documentElement.getAttribute("data-theme");
        widgetId = window.turnstile.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: stamped === "dark" || stamped === "light" ? stamped : "auto",
          callback: (token: string) => cbRef.current(token),
          "expired-callback": () => cbRef.current(null),
          "error-callback": () => cbRef.current(null),
        });
      })
      .catch(() => {
        // Load failed → surface it and offer a retry instead of a silently dead button.
        if (!cancelled) {
          setFailed(true);
          cbRef.current(null);
        }
      });

    return () => {
      cancelled = true;
      if (widgetId) {
        try {
          window.turnstile?.remove(widgetId);
        } catch {
          // page teardown race — safe to ignore
        }
      }
    };
  }, [attempt]);

  if (!turnstileEnabled) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} className="flex justify-center" />
      {failed && (
        <p
          className="text-xs font-semibold text-center leading-relaxed"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}
        >
          <span style={{ color: "#ef4444" }}>보안 확인을 불러오지 못했어요.</span>{" "}
          광고 차단을 끄거나{" "}
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            style={{
              color: "var(--blue)", fontWeight: 700, background: "none", border: "none",
              cursor: "pointer", padding: 0, textDecoration: "underline",
              fontFamily: "var(--font-nunito)", fontSize: "inherit",
            }}
          >
            다시 시도
          </button>
          해 주세요.
        </p>
      )}
    </div>
  );
}
