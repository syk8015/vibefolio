"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";

// 초안 검토 창 "업그레이드"(2026-10-01, 사용자가 고른 시안): 방문자 미리보기를 방문자가 볼 작은 브라우저 틀에 넣는다.
// 주소 줄은 주인의 프레임 주소(nookframe.com/아이디), 위에 한 줄 "방문자에게 이렇게 보여요".
// 주소 줄 오른쪽 칸(right)은 KO/EN 스위치 자리 — 보는 사람의 언어를 고르는 것이라 브라우저 쪽에 둔다.
// 색은 전부 테마 변수(틀) — 안은 프레임 페이지를 작게 그린 것이라(10-02) 늘 어두운 건 무대 띠뿐이다
// (WorkCardPreview의 MiniStage, DraftReviewModal 머리 주석).
export function VisitorFrame({ address, right, tight = false, center = false, children }: {
  /** 주소 줄 글자 — "nookframe.com/아이디"(아이디를 모르면 "nookframe.com") */
  address: string;
  /** 주소 줄 오른쪽 끝 칸 */
  right?: ReactNode;
  /** 아래 내용이 펼쳐져 미리보기가 작아질 때 — 틀도 한 단계 좁힌다 */
  tight?: boolean;
  /** 위 한 줄을 가운데로(공개한 뒤 화면) */
  center?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col" style={{ gap: tight ? 6 : 8, minWidth: 0 }}>
      <p
        className="flex items-center"
        style={{
          margin: 0, gap: 6, justifyContent: center ? "center" : undefined,
          fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: "var(--text-secondary)",
        }}
      >
        <EyeGlyph />
        {t.projects.reviewVisitorView}
      </p>
      <div
        style={{
          borderRadius: 16, overflow: "hidden", background: "var(--bg)",
          boxShadow: "0 0 0 1px var(--border), 0 1px 2px rgba(0,0,0,0.04), 0 14px 30px -10px rgba(0,0,0,0.16)",
        }}
      >
        <div
          style={{
            height: tight ? 26 : 30, display: "grid", alignItems: "center", gap: 8, padding: "0 10px 0 12px",
            // 양 끝 칸을 같은 비율로 둬서 주소가 늘 가운데에 선다(KO/EN이 없을 때도)
            gridTemplateColumns: "minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)",
            background: "linear-gradient(var(--surface), var(--surface-sunken))",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span aria-hidden className="flex" style={{ gap: 5 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: 999, background: "var(--border-bright)" }} />
            ))}
          </span>
          <span
            className="vf-mono inline-flex items-center"
            style={{
              gap: 6, minWidth: 0, padding: tight ? "1px 12px" : "2px 12px", borderRadius: 999,
              background: "var(--surface)", boxShadow: "inset 0 0 0 1px var(--border)",
              color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6,
            }}
          >
            <LockGlyph />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{address}</span>
          </span>
          <span className="flex justify-end">{right}</span>
        </div>
        <div style={{ padding: tight ? 6 : 8 }}>{children}</div>
      </div>
    </div>
  );
}

function EyeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <rect x="1" y="4.4" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.6 4.4V3.1a1.9 1.9 0 0 1 3.8 0v1.3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
