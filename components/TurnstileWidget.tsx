"use client";

import { useEffect, useRef } from "react";

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

let loadPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      window.__nfTurnstileOnload = () => resolve();
      const s = document.createElement("script");
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__nfTurnstileOnload&render=explicit";
      s.async = true;
      document.head.appendChild(s);
    });
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
  /** Fires with the token when solved, and null when it expires/errors. */
  onToken: (token: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onToken);
  cbRef.current = onToken;

  useEffect(() => {
    if (!turnstileEnabled) return;
    const el = ref.current;
    if (!el) return;
    let widgetId: string | null = null;
    let cancelled = false;

    loadTurnstile().then(() => {
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
  }, []);

  if (!turnstileEnabled) return null;
  return <div ref={ref} className="flex justify-center" />;
}
