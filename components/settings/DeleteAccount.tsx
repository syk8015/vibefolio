"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import { Section } from "./ui";

// 회원 탈퇴 칸(옅은 빨강 채움) + 확인 창 — 09-26 명함 탭에서 설정 화면으로 옮겼다(문구 키는 그대로
// t.card.*, 칸의 경고 한 줄만 t.settings.deleteBody). soft-fill 언어: 경고는 테두리가 아니라 옅은 채움으로.
// (privacy: 탈퇴 즉시 파기) 10-02 덜어내기 2차: 되돌릴 수 없는 일이라 경고는 늘 보이게 두되 한 줄로,
// 버튼은 다른 줄처럼 오른쪽 알약 버튼. 좁으면 버튼이 경고 아래로 내려간다. 확인 창은 그대로.
// 빨간 글자에 글자색을 15% 섞는다(2026-09-25) — 옅은 빨강 채움 위에서 --danger 그대로는
// 라이트 버튼이 대비 4.1이었다. 섞으면 라이트는 더 진하게, 다크는 더 밝게 바탕에서 멀어진다.
const DANGER_ON_TINT = "color-mix(in srgb, var(--danger) 85%, var(--text-primary))";

export default function DeleteAccount({ username }: { username: string }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || t.card.deleteFailed);
      }
      // 계정과 데이터가 사라졌다 — 이 기기의 세션만 비우고 나간다(사용자가 없어 범위는 의미 없음).
      await createClient().auth.signOut();
      router.push("/");
      router.refresh();
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : t.card.deleteFailed);
    }
  }

  // 확인 문자열은 저장된 아이디 — 서버가 내려준 profiles 값이다.
  const mismatch = confirm.trim() !== username;

  return (
    <Section label={t.card.accountLabel}>
      <div className="rounded-2xl flex flex-wrap items-center gap-x-4 gap-y-3"
        style={{ background: "rgba(179,71,71,0.06)", padding: "1.125rem 1.25rem" }}>
        <div className="min-w-0" style={{ flex: "1 1 12rem" }}>
          <h3 className="text-sm font-black" style={{ color: DANGER_ON_TINT, fontFamily: "var(--font-nunito)", lineHeight: 1.45 }}>{t.card.deleteTitle}</h3>
          <p className="text-sm" style={{ marginTop: 3, color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
            {t.settings.deleteBody}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(true); setConfirm(""); setError(""); }}
          className="shrink-0 text-sm font-bold rounded-full whitespace-nowrap transition-opacity hover:opacity-80 motion-reduce:transition-none"
          style={{ padding: "0.5rem 1.125rem", color: DANGER_ON_TINT, background: "rgba(179,71,71,0.12)", border: "none", cursor: "pointer", fontFamily: "var(--font-nunito)" }}
        >
          {t.card.deleteBtn}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => { if (!deleting) setOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
              {t.card.deleteModalTitle}
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.65 }}>
              <strong style={{ color: "var(--text-primary)" }}>@{username}</strong>{t.card.deleteModalBody}
            </p>
            <label className="vf-label" htmlFor="delete-confirm">
              {t.card.confirmPrefix}<span style={{ color: "var(--text-primary)" }}>{username}</span>{t.card.confirmSuffix}
            </label>
            <input
              id="delete-confirm"
              className="vf-input"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              placeholder={username}
              autoComplete="off"
              disabled={deleting}
              autoFocus
            />
            {error && (
              <p className="text-sm mt-2" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{error}</p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-80"
                style={{ background: "var(--surface-soft)", color: "var(--text-primary)", border: "none", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "var(--font-nunito)" }}
              >
                {t.card.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || mismatch}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity"
                style={{ background: "#b34747", color: "#fff", border: "none", cursor: (deleting || mismatch) ? "not-allowed" : "pointer", opacity: (deleting || mismatch) ? 0.5 : 1, fontFamily: "var(--font-nunito)" }}
              >
                {deleting ? t.card.deleting : t.card.deleteForever}
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
