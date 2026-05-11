"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  username: string;
  customMode: boolean;
}

export default function DevModeButton({ username, customMode }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function activate() {
    setLoading(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ custom_mode: true }).eq("username", username);
    setLoading(false);
    setShowConfirm(false);
    router.refresh();
  }

  if (customMode) {
    return (
      <a
        href="/dashboard"
        className="fixed bottom-5 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold z-50 transition-opacity hover:opacity-80"
        style={{
          background: "rgba(77,158,255,0.12)",
          border: "1px solid rgba(77,158,255,0.3)",
          color: "var(--blue)",
          fontFamily: "var(--font-nunito)",
          textDecoration: "none",
          backdropFilter: "blur(8px)",
        }}
      >
        <span style={{ fontSize: "0.65rem" }}>⚙</span> custom mode
      </a>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="fixed bottom-5 right-5 z-50 transition-all hover:scale-105"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        title="개발자만 클릭하세요"
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black"
          style={{
            background: "repeating-linear-gradient(45deg, #f59e0b, #f59e0b 6px, #1c1c1c 6px, #1c1c1c 12px)",
            color: "#fff",
            fontFamily: "var(--font-nunito)",
            border: "2px solid #f59e0b",
            letterSpacing: "0.05em",
            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          }}
        >
          🚧 관계자 외 출입금지
        </div>
      </button>

      {showConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center"
            style={{ background: "var(--surface)", border: "2px solid #f59e0b" }}
          >
            <div className="text-4xl mb-4">🚧</div>
            <h2 className="text-xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
              개발자 전용 구역
            </h2>
            <p className="text-sm mb-1 font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              이 구역은 코드를 아는 자만 입장 가능합니다.
            </p>
            <p className="text-xs mb-6" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              커스텀 모드로 전환하면 대시보드에서 CSS로<br />명함을 자유롭게 꾸밀 수 있어요.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ border: "1px solid var(--border-bright)", color: "var(--text-secondary)", background: "none", fontFamily: "var(--font-nunito)", cursor: "pointer" }}
              >
                돌아가기
              </button>
              <button
                onClick={activate}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-black disabled:opacity-50"
                style={{ background: "#f59e0b", color: "#000", fontFamily: "var(--font-nunito)", border: "none", cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "전환 중..." : "입장하기 🚀"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
