import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { checkAdmin } from "@/lib/routeAuth";
import { adminNext } from "@/lib/adminStepUp";
import { VerifyClient, type VerifyMode } from "./VerifyClient";

// 관리자 추가 인증(2026-11-02, lib/adminStepUp.ts). 관리자만 열린다(그 밖엔 404).
//   집 나라 밖 + 인증 앱 있음  → 6자리 넣기 → 돌아갈 곳(?next=)으로
//   집 나라 밖 + 인증 앱 없음  → 못 연다고만 알린다(여기서 등록하게 두면 훔친 세션이 자기 앱을 단다)
//   집 나라 + 인증 앱 없음     → 등록
//   집 나라 + 인증 앱 있음     → 등록돼 있다고 알린다(돌아갈 곳이 있으면 바로 보낸다)
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "인증 앱", robots: { index: false, follow: false } };

export default async function AdminVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const gate = await checkAdmin("/admin/verify");
  if (gate.kind === "denied") notFound();
  const { next: rawNext } = await searchParams;
  const next = adminNext(rawNext);

  const factorId =
    (gate.user.factors ?? []).find((f) => f.factor_type === "totp" && f.status === "verified")?.id ?? null;

  let mode: VerifyMode;
  if (gate.kind === "step-up") {
    mode = factorId ? "code" : "blocked";
  } else if (!factorId) {
    mode = "enroll";
  } else {
    if (rawNext) redirect(next);
    mode = "done";
  }

  return <VerifyClient mode={mode} factorId={factorId} next={next} country={gate.kind === "step-up" ? gate.country : null} />;
}
