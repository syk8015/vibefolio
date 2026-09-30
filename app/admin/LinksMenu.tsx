"use client";

import { useEffect, useRef, useState } from "react";

// 관제탑 머리줄의 [바로가기 ▾] — 바깥 서비스 링크 9개를 한 메뉴로 접는다(라, 2026-10-01).
// 링크 목록은 page.tsx가 넘긴다. 바깥을 누르거나 Esc면 닫힌다.

export type AdminLink = { label: string; href: string };

export function LinksMenu({ links }: { links: AdminLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="vf-button-ghost"
        style={{ padding: "0.45rem 0.95rem", fontSize: "0.8125rem" }}
      >
        바로가기 <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 flex flex-col"
          style={{
            top: "calc(100% + 8px)",
            zIndex: 20,
            minWidth: 220,
            padding: 6,
            borderRadius: 14,
            background: "var(--surface)",
            boxShadow: "var(--shadow-card-small)",
          }}
        >
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="rounded-[10px] hover:bg-[var(--surface-sunken)]"
              style={{ padding: "10px 12px", fontSize: "0.875rem", color: "var(--text-primary)" }}
            >
              {l.label} <span aria-hidden style={{ color: "var(--text-muted)" }}>↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
