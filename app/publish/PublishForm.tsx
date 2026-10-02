"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { PasteReply } from "@/components/publish/PasteReply";
import { DraftPreviewPanel, draftPreview } from "@/components/publish/DraftPreview";
import { StepCheckIcon } from "@/components/dashboard/JourneyStrip";

// 셸 없는 챗봇 경로의 마지막 구간 — 사람이 AI 답을 옮겨 오는 자리.
//
// 2026-09-04(인터뷰 ⑦): 웹 챗 AI는 서버로 직접 못 보내니 사람이 옮기는 건 구조적으로
// 남는다. 대신 **동작 수를 줄인다** — 펜스·설명이 섞인 AI 답을 통째로 받아도 된다(lib/extractPublishJson).
// 칸 본체는 연결 창과 같이 쓰려고 components/publish/PasteReply로 옮겼다(2026-09-22, D6).
//
// 라 시안(2026-10-01 덜어내기): 가운데 제목 · 공개 범위 한 줄 · 큰 칸 · 버튼 하나. 설명 문단과
// "프롬프트는 대시보드에 있어요" 안내는 뺐다 — 로고가 대시보드로 데려간다.
//
// 업그레이드(2026-10-01, 사용자 확정): 맨 위 작은 3단계 길(AI 답 복사 → 붙여넣기 → 초안 확인)과 칸 오른쪽
// '초안 미리보기' 판. 둘 다 칸의 글을 따라간다 — 올릴 수 있는 답이면 미리보기 카드가 뜨고 셋째 칸이 지금
// 차례, 비었거나 서버가 거절한 그 글 그대로면 둘째 칸(다시 붙여넣을 차례).
type TrailState = "done" | "now" | "todo";

function PublishTrail({ step }: { step: 2 | 3 }) {
  const { t } = useT();
  const tt = t.publish.trail;
  // 이음 점선은 따로 선 조각이다 — 8px에서 시작해 자리가 있으면 34px까지 늘어나서, 좁은 화면에서도 줄을
  // 바꾸기 전에 점선부터 줄어든다(목록 의미는 role로, 점선은 읽지 않게 숨긴다).
  return (
    <div role="list" aria-label={tt.label} className="flex flex-wrap items-center justify-center" style={{ columnGap: 10, rowGap: 8 }}>
      {[tt.copy, tt.paste, tt.check].map((label, i) => {
        const n = i + 1;
        const state: TrailState = n < step ? "done" : n === step ? "now" : "todo";
        const dot: React.CSSProperties = state === "done"
          ? { background: "var(--surface-active)", color: "var(--text-primary)" }
          : state === "now"
            ? { background: "var(--text-primary)", color: "var(--bg)", boxShadow: "0 0 0 4px var(--blue-tint-strong)" }
            : { boxShadow: "inset 0 0 0 1.5px var(--border-bright)", color: "var(--text-muted)" };
        return (
          <Fragment key={n}>
            {i > 0 && <span aria-hidden="true" style={{ flex: "1 1 8px", minWidth: 8, maxWidth: 34, borderTop: "1.5px dotted var(--border-bright)" }} />}
            <span role="listitem" aria-current={state === "now" ? "step" : undefined} className="inline-flex items-center whitespace-nowrap shrink-0" style={{
              gap: 7, fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.5,
              color: state === "done" ? "var(--text-secondary)" : state === "now" ? "var(--text-primary)" : "var(--text-muted)",
            }}>
              <span aria-hidden="true" className="vf-mono inline-flex items-center justify-center rounded-full shrink-0"
                style={{ width: 20, height: 20, fontSize: 11, fontWeight: 700, lineHeight: 1, ...dot }}>
                {state === "done" ? <StepCheckIcon size={11} /> : n}
              </span>
              {label}
              {state === "done" && <span className="sr-only"> ({t.common.stepDone})</span>}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

export default function PublishForm() {
  const router = useRouter();
  const { t } = useT();
  // 칸의 글(PasteReply가 바뀔 때마다 알려 준다) — 3단계 길과 미리보기 판이 이것만 보고 그린다.
  const [box, setBox] = useState({ text: "", rejected: false });
  const preview = useMemo(() => draftPreview(box.text), [box.text]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
        <Logo href="/dashboard" />
        <LanguageToggle />
      </nav>

      {/* 칸 옆에 판이 서는 넓은 화면(lg)만 넓게 — 그보다 좁으면 라의 한 줄기(640) 그대로 */}
      <main className="max-w-[640px] lg:max-w-[992px] mx-auto px-6 pt-8 md:pt-12 pb-20 flex flex-col gap-5" style={{ wordBreak: "keep-all" }}>
        <PublishTrail step={preview && !box.rejected ? 3 : 2} />
        <header className="flex flex-col gap-2 text-center" style={{ marginTop: 6 }}>
          <h1 className="vf-serif-display" style={{ fontSize: "clamp(1.75rem, 4vw, 2.125rem)", fontWeight: 600, lineHeight: 1.25, margin: 0 }}>
            {t.publish.title}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>
            {t.publish.lead}
          </p>
        </header>

        <PasteReply
          aside={<DraftPreviewPanel preview={preview} />}
          onBoxChange={(text, rejected) => setBox((b) => (b.text === text && b.rejected === rejected ? b : { text, rejected }))}
          onSuccess={(id) => router.push(`/dashboard?review=${id}`)}
        />
      </main>
    </div>
  );
}
