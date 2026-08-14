"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { copyText } from "@/lib/clipboard";
import { pastePrompt, AUTO_TOKEN_NAME } from "@/lib/connectSnippets";
import { useT } from "@/lib/i18n/client";

interface TokenRow {
  id: string;
  token_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

// 옛 "연결" 독립 탭(내부 id는 settings — 라벨과 불일치). 작품을 "넣는 방법"이라
// 작품 탭의 접히는 영역으로 흡수됐고, 이름도 실제 역할에 맞춰 ConnectPanel로.
// username은 profiles 단일 출처(ProjectsTab 경유) — metadata 파생 금지.
//
// 요청5(2026-08-14): "토큰 발급 → 프롬프트 복사" 2단계를 버튼 하나로 단일화.
// [프롬프트 복사]가 눌리는 순간 서버가 새 토큰을 발급(이전 자동발급분 폐기)하고,
// 토큰이 든 프롬프트를 통째로 클립보드에 넣는다. raw 토큰은 화면에 절대 안 그린다 —
// 미리보기 <pre>는 token 없이 호출돼 자리표시 문구가 들어간다.
export default function ConnectPanel({ username }: { username: string }) {
  const { t, locale } = useT();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://nookframe.com";

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("api_tokens")
      .select("id, token_prefix, name, created_at, last_used_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    setTokens((data as TokenRow[]) ?? []);
    setLoading(false);
  }
  // 마운트 시 1회 토큰 목록 로드 — 훅 규칙은 await 뒤 setState까지 동기로 보수
  // 판정하지만 실제 캐스케이드 렌더는 없다(ProjectsTab loadProjects와 동일).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  // 발급+복사 원자 흐름. 발급은 됐는데 클립보드가 실패하면 그 토큰은 버려진 상태로
  // 남지만, 다음 시도가 자동 폐기하므로 따로 청소하지 않는다.
  async function copyPromptWithToken() {
    setCopying(true);
    setError(null);
    setCopiedOnce(false);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t.connect.issueFailed);
        return;
      }
      const ok = await copyText(pastePrompt(origin, locale, body.token as string));
      if (!ok) {
        setError(t.connect.copyFailed);
        return;
      }
      setCopiedOnce(true);
      await load();
    } catch {
      setError(t.connect.networkFailed);
    } finally {
      setCopying(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t.connect.revokeConfirm)) return;
    setTokens((prev) => prev.filter((t) => t.id !== id)); // optimistic
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setError(t.connect.revokeFailed);
      load();
    }
  }

  return (
    <div>
      {/* 소개 — 제목은 접기 헤더가 갖고 있으므로 설명만 */}
      <p className="text-sm mb-5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
        {t.connect.intro1}<b style={{ color: "var(--text-primary)" }}>{username}</b>{t.connect.intro2}
      </p>

      {/* 붙여넣기 프롬프트 — 복사 순간 토큰 자동 발급·내장 */}
      <div className="vf-card p-5 mb-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
            {t.connect.promptTitle}
          </p>
          <button
            type="button"
            onClick={copyPromptWithToken}
            disabled={copying}
            className="vf-button-primary"
            style={{ whiteSpace: "nowrap", fontSize: "0.8rem", padding: "0.45rem 0.9rem", opacity: copying ? 0.6 : 1 }}
          >
            {copying ? t.connect.copying : t.connect.copyPrompt}
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
          {t.connect.promptBody}
        </p>
        {copiedOnce && (
          <p className="text-xs mb-3 p-3 rounded-lg" style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
            {t.connect.copiedNote}
          </p>
        )}
        {error && (
          <p className="text-xs mb-3" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{error}</p>
        )}
        <pre
          className="text-xs p-3 rounded-lg"
          style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 240, overflowY: "auto" }}
        >
          {pastePrompt(origin, locale)}
        </pre>
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
          {t.connect.noShell1}<Link href="/publish" style={{ color: "var(--text-primary)", textDecoration: "underline" }}>{origin.replace(/^https?:\/\//, "")}/publish</Link>{t.connect.noShell2}
        </p>
      </div>

      {/* 발급된 토큰 목록 */}
      <div className="vf-card p-5">
        <p className="text-sm mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
          {t.connect.tokensTitle}
        </p>
        {loading ? (
          <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>{t.connect.loading}</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>{t.connect.noTokens}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {tokens.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                    {row.name === AUTO_TOKEN_NAME ? t.connect.autoTokenName : row.name || t.connect.unnamed}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                    {row.token_prefix} · {row.last_used_at ? t.connect.lastUsed(new Date(row.last_used_at).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US")) : t.connect.neverUsed}
                  </p>
                </div>
                <button onClick={() => revoke(row.id)} className="vf-button-ghost" style={{ fontSize: "0.75rem", padding: "0.35rem 0.7rem", whiteSpace: "nowrap" }}>
                  {t.connect.revoke}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
