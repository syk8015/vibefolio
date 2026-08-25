"use client";

import ConnectPanel from "@/components/dashboard/ConnectPanel";
import { useT } from "@/lib/i18n/client";

// [프로젝트 추가] 오버레이 모달 — 화면은 AI 연결(ConnectPanel) 하나뿐이다.
//
// 2026-08-25(사용자 확정): 새로 올리는 길을 AI 경로로 통일하고 수동 추가 위저드를
// 폐기했다. 이유는 품질 — 만든 AI만이 "어떤 화면에서 뭘 눌러야 핵심이 보이는지"를
// 알고, 그 촬영 대본(demoScript)이 자동 시연 영상의 품질을 결정한다. 사람이 URL만
// 넣고 끝내던 옛 경로는 대본 없이 로봇이 픽셀만 보고 추측하게 만들었다.
// 이미 올린 작품의 수정은 그대로 사람 몫(ProjectFormModal 평면 폼).
export function AddProjectModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: "min(46rem, calc(100vw - 2rem))",
          maxHeight: "92vh",
          // 페이지 배경(vf-card·soft-fill이 얹히는 면) 위에 설계된 UI라 surface가
          // 아니라 bg를 깐다 — surface면 내부 카드가 면에 묻힌다.
          background: "var(--bg)",
          borderRadius: 20,
          boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
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
        <div className="overflow-y-auto px-6 py-6">
          <ConnectPanel />
        </div>
      </div>
    </div>
  );
}
