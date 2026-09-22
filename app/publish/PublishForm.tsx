"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import LanguageToggle from "@/components/LanguageToggle";
import { PasteReply } from "@/components/publish/PasteReply";

// 셸 없는 챗봇 경로의 마지막 구간 — 사람이 AI 답을 옮겨 오는 자리.
//
// 2026-09-04(인터뷰 ⑦): 웹 챗 AI는 서버로 직접 못 보내니 사람이 옮기는 건 구조적으로
// 남는다. 대신 **동작 수를 줄인다**. 전엔 복사 → 이동 → 펜스 지우기 → 붙여넣기 → 버튼.
// 이제 (1) 클립보드 버튼 하나로 골라내서 바로 올리거나 (2) 붙여넣는 순간 바로 올라간다.
// 펜스·설명이 섞인 AI 답을 통째로 받아도 된다(lib/extractPublishJson).
// 칸 본체는 연결 창과 같이 쓰려고 components/publish/PasteReply로 옮겼다(2026-09-22, D6).
export default function PublishForm() {
  const router = useRouter();
  const { t } = useT();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
            {t.publish.backToDashboard}
          </Link>
          <LanguageToggle />
        </div>

        <h1 className="vf-serif-display mt-6 mb-2" style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", fontWeight: 500 }}>
          {t.publish.title}
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
          {t.publish.intro} {t.publish.promptHintBefore}
          <Link href="/dashboard" style={{ color: "var(--text-primary)", textDecoration: "underline" }}>{t.publish.promptHintLink}</Link>
          {t.publish.promptHintAfter}
        </p>

        <PasteReply onSuccess={(id) => router.push(`/dashboard?review=${id}`)} />
      </div>
    </div>
  );
}
