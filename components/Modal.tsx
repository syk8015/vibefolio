"use client";

import { useEffect, useRef } from "react";

// Shared dialog primitive. Unifies what used to be hand-rolled per modal (backdrop
// opacity, surface tokens, radius, shadow) and adds the a11y/behaviour they were
// missing: role="dialog" + aria-modal, Escape to close, backdrop-click to close,
// focus moved into the dialog on open, and a body-scroll lock while open.
//
// Children provide their own content + padding wrapper; the primitive owns only the
// overlay + card shell + behaviour.
export default function Modal({
  onClose,
  children,
  ariaLabel,
  maxWidth = "28rem",
  padding = "24px",
}: {
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel: string;
  maxWidth?: number | string;
  padding?: number | string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          padding,
          background: "var(--surface)",
          border: "1px solid var(--border-bright)",
          borderRadius: 18,
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          fontFamily: "var(--font-nunito)",
          outline: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
