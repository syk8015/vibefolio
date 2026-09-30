"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { PasteReply } from "@/components/publish/PasteReply";

// 셸 없는 챗봇 경로의 마지막 구간 — 사람이 AI 답을 옮겨 오는 자리.
//
// 2026-09-04(인터뷰 ⑦): 웹 챗 AI는 서버로 직접 못 보내니 사람이 옮기는 건 구조적으로
// 남는다. 대신 **동작 수를 줄인다** — 펜스·설명이 섞인 AI 답을 통째로 받아도 된다(lib/extractPublishJson).
// 칸 본체는 연결 창과 같이 쓰려고 components/publish/PasteReply로 옮겼다(2026-09-22, D6).
//
// 라 시안(2026-10-01 덜어내기): 가운데 제목 · 공개 범위 한 줄 · 큰 칸 · 버튼 하나. 설명 문단과
// "프롬프트는 대시보드에 있어요" 안내는 뺐다 — 로고가 대시보드로 데려간다.
export default function PublishForm() {
  const router = useRouter();
  const { t } = useT();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
        <Logo href="/dashboard" />
        <LanguageToggle />
      </nav>

      <main className="max-w-[640px] mx-auto px-6 pt-8 md:pt-14 pb-20 flex flex-col gap-5" style={{ wordBreak: "keep-all" }}>
        <header className="flex flex-col gap-2 text-center">
          <h1 className="vf-serif-display" style={{ fontSize: "clamp(1.75rem, 4vw, 2.125rem)", fontWeight: 600, lineHeight: 1.25, margin: 0 }}>
            {t.publish.title}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>
            {t.publish.lead}
          </p>
        </header>

        <PasteReply onSuccess={(id) => router.push(`/dashboard?review=${id}`)} />
      </main>
    </div>
  );
}
