"use client";

import { useState } from "react";
import ConnectPanel from "@/components/dashboard/ConnectPanel";
import { ProjectFormModal } from "./ProjectFormModal";
import { EMPTY_FORM, type ProjectForm } from "./types";
import { useT } from "@/lib/i18n/client";

// [프로젝트 추가] 오버레이 모달. 기본 화면은 AI 연결(ConnectPanel) — AI 한 줄
// 올리기가 표준 경로라는 위계를 UI로 말한다. 우상단 [수동으로 추가하기]를 눌러야
// 기존 단계식 위저드가 나오고, 위저드의 취소는 모달 닫기가 아니라 AI 화면 복귀다.
export function AddProjectModal({ username, userId, onClose, onSubmit }: {
  username: string;
  userId: string;
  onClose: () => void;
  onSubmit: (form: ProjectForm) => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<"ai" | "manual">("ai");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      // 위저드 진행 중 배경 오클릭으로 입력을 날리지 않게, 배경 닫기는 AI 화면에서만.
      onClick={e => { if (e.target === e.currentTarget && mode === "ai") onClose(); }}
    >
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: mode === "ai" ? "min(46rem, calc(100vw - 2rem))" : "min(72rem, calc(100vw - 2rem))",
          height: mode === "manual" ? "min(92vh, 860px)" : undefined,
          maxHeight: "92vh",
          // 두 화면 다 페이지 배경(vf-card·soft-fill이 얹히는 면) 위에 설계된 UI라
          // surface가 아니라 bg를 깐다 — surface면 내부 카드가 면에 묻힌다.
          background: "var(--bg)",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {mode === "ai" ? (
          <>
            {/* Header — 제목 + [수동으로 추가하기] + 닫기 */}
            <div className="flex items-start gap-3 px-6 pt-5 pb-4"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex-1 min-w-0">
                <h2 className="vf-serif-display" style={{ fontSize: "1.2rem", fontWeight: 500, margin: 0 }}>
                  {t.projects.connectTitle}
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
                  {t.projects.connectSubtitle}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="vf-soft-fill rounded-full"
                  style={{ padding: "0.5rem 1rem", fontFamily: "var(--font-nunito)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {t.projects.manualAdd}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="vf-soft-fill flex items-center justify-center rounded-full"
                  style={{ width: 32, height: 32, cursor: "pointer", flexShrink: 0 }}
                  aria-label={t.projectForm.closeAria}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              <ConnectPanel username={username} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 pb-4">
            <ProjectFormModal
              title={t.projects.addTitle}
              initialForm={EMPTY_FORM}
              onClose={() => setMode("ai")}
              onSubmit={onSubmit}
              submitLabel={t.projects.submitAdd}
              userId={userId}
              wizard
            />
          </div>
        )}
      </div>
    </div>
  );
}
