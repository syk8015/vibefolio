"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { copyText } from "@/lib/clipboard";
import { pastePrompt, envExport, NPX_LOGIN } from "@/lib/connectSnippets";
import { useT } from "@/lib/i18n/client";

interface TokenRow {
  id: string;
  token_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
      className="vf-button-ghost"
      style={{ fontSize: "0.75rem", padding: "0.35rem 0.7rem", whiteSpace: "nowrap" }}
    >
      {copied ? t.connect.copied : label ?? t.connect.copy}
    </button>
  );
}

// 옛 "연결" 독립 탭(내부 id는 settings — 라벨과 불일치). 작품을 "넣는 방법"이라
// 작품 탭의 접히는 영역으로 흡수됐고, 이름도 실제 역할에 맞춰 ConnectPanel로.
// username은 profiles 단일 출처(ProjectsTab 경유) — metadata 파생 금지.
export default function ConnectPanel({ username }: { username: string }) {
  const { t, locale } = useT();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
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

  async function createToken() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t.connect.issueFailed);
        return;
      }
      setRevealed(body.token as string);
      setNewName("");
      await load();
    } catch {
      setError(t.connect.networkFailed);
    } finally {
      setCreating(false);
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

      {/* 1) 토큰 발급 */}
      <div className="vf-card p-5 mb-5">
        <p className="text-sm mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
          {t.connect.step1Title}
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
          {t.connect.step1Body}
        </p>

        {revealed ? (
          <div className="p-3 rounded-lg mb-1" style={{ background: "var(--surface-soft)", border: "1px solid var(--border)" }}>
            <p className="text-xs mb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              {t.connect.revealNote}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <code className="flex-1 min-w-0 text-xs px-2 py-2 rounded" style={{ background: "var(--bg)", color: "var(--text-primary)", fontFamily: "var(--font-mono), monospace", overflowX: "auto", whiteSpace: "nowrap" }}>
                {revealed}
              </code>
              <CopyButton text={revealed} />
            </div>
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {t.connect.terminalOnce}
            </p>
            <div className="flex items-center gap-2 mb-2">
              <code className="flex-1 min-w-0 text-xs px-2 py-2 rounded" style={{ background: "var(--bg)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace", overflowX: "auto", whiteSpace: "nowrap" }}>
                {envExport(revealed)}
              </code>
              <CopyButton text={envExport(revealed)} />
            </div>
            <button onClick={() => setRevealed(null)} className="vf-button-ghost" style={{ fontSize: "0.75rem", padding: "0.35rem 0.7rem" }}>
              {t.connect.savedClose}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              className="vf-input flex-1"
              placeholder={t.connect.tokenNamePlaceholder}
              value={newName}
              maxLength={80}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button onClick={createToken} disabled={creating} className="vf-button-primary" style={{ whiteSpace: "nowrap", opacity: creating ? 0.6 : 1 }}>
              {creating ? t.connect.issuing : t.connect.issue}
            </button>
          </div>
        )}
        {error && (
          <p className="text-xs mt-2" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{error}</p>
        )}
      </div>

      {/* 2) 붙여넣기 프롬프트 */}
      <div className="vf-card p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
            {t.connect.step2Title}
          </p>
          <CopyButton text={pastePrompt(origin)} label={t.connect.copyPrompt} />
        </div>
        <pre
          className="text-xs p-3 rounded-lg"
          style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 240, overflowY: "auto" }}
        >
          {pastePrompt(origin)}
        </pre>
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
          {t.connect.noShell1}<Link href="/publish" style={{ color: "var(--text-primary)", textDecoration: "underline" }}>{origin.replace(/^https?:\/\//, "")}/publish</Link>{t.connect.noShell2}<code style={{ fontFamily: "var(--font-mono), monospace" }}>{NPX_LOGIN}</code>{t.connect.noShell3}
        </p>
      </div>

      {/* 3) 발급된 토큰 목록 */}
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
                    {row.name || t.connect.unnamed}
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
