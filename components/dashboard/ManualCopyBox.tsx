"use client";

import { useT } from "@/lib/i18n/client";

// 자동 복사가 막혔을 때의 출구(2026-09-22, 출시 점검 A2). 사파리처럼 클립보드 쓰기를
// 거절하는 환경에서 "한 번 더 눌러주세요"만 반복하면 누를 때마다 새 코드가 발급될 뿐
// 끝내 못 넘어간다. 이미 받은 글을 읽기 전용 칸에 펼쳐, 사람이 직접 복사하게 한다.
export function ManualCopyBox({ text, rows = 6 }: { text: string; rows?: number }) {
  const { t } = useT();
  return (
    <div className="w-full text-left">
      <p className="text-xs" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, lineHeight: 1.6, margin: "0 0 6px" }}>
        {t.connect.manualCopyLead}
      </p>
      <textarea
        readOnly
        value={text}
        rows={rows}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.currentTarget.select()}
        className="vf-input w-full resize-none"
        style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", lineHeight: 1.5 }}
      />
    </div>
  );
}
