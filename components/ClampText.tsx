"use client";

import { useEffect, useRef, useState } from "react";

// 폰에서만 긴 본문을 몇 줄로 접어주는 문단. 접기는 CSS(.vf-clamp-m, 767px 게이트)가
// 하고, 이 컴포넌트는 "실제로 잘렸는지" 재서 더보기 버튼을 붙일지만 정한다.
// → 데스크탑에서는 클래스가 아무 일도 하지 않아 버튼도 뜨지 않는다.
export default function ClampText({
  text,
  lines = 8,
  moreLabel,
  lessLabel,
  className = "",
  style,
}: {
  text: string;
  lines?: number;
  moreLabel: string;
  lessLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (expanded) return; // 펼친 상태에서는 잴 게 없다
      setTruncated(el.scrollHeight > el.clientHeight + 4);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded]);

  return (
    <>
      <p
        ref={ref}
        className={`${expanded ? "" : "vf-clamp-m"} ${className}`}
        style={{ ...style, ["--vf-clamp-lines" as string]: lines }}
      >
        {text}
      </p>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 8,
            padding: 0,
            border: "none",
            background: "transparent",
            color: "var(--text-primary)",
            opacity: 0.62,
            fontFamily: "var(--font-nunito)",
            fontSize: "0.82rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {expanded ? lessLabel : moreLabel}
          <span aria-hidden style={{ marginLeft: 5 }}>{expanded ? "↑" : "↓"}</span>
        </button>
      )}
    </>
  );
}
