"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import { AUTO_TOKEN_NAME, MCP_TOKEN_NAME } from "@/lib/connectSnippets";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { InlineConfirm, List, Row, Section, TEXT, pillStyle } from "./ui";

// 설정 "AI 연결"(2026-09-26) — AI 도구에 준 연결(api_tokens)을 보고 끊는다. 작품 탭 연결 창의
// 접힌 [연결 관리]와 같은 표·같은 끊기 주소(/api/tokens/[id] DELETE)다 — 연결 창은 "연결하기"가
// 본업이라 관리는 여기가 정본. 목록은 원할 때만 펼친다(브랜드 철학 "원할 때만 보여준다").
interface TokenRow {
  id: string;
  token_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

function tokenName(name: string | null, t: Dictionary): string {
  if (name === AUTO_TOKEN_NAME) return t.connect.autoTokenName;
  if (name === MCP_TOKEN_NAME) return t.connect.mcpTokenName;
  // 원격 커넥터(OAuth)는 lib/oauth가 `oauth:<호스트>`로 적는다.
  if (name?.startsWith("oauth:")) return t.settings.oauthTokenName(name.slice("oauth:".length));
  return name || t.connect.unnamed;
}

export default function AiConnections() {
  const { t, locale } = useT();
  const ts = t.settings;
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revokeFailed, setRevokeFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    createClient()
      .from("api_tokens")
      .select("id, token_prefix, name, created_at, last_used_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setLoadFailed(true);
        else setTokens((data as TokenRow[]) ?? []);
      });
    return () => { alive = false; };
  }, []);

  async function revoke(id: string) {
    setBusy(id);
    setRevokeFailed(false);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    setConfirmId(null);
    if (!res || !res.ok) {
      setRevokeFailed(true);
      return;
    }
    setTokens((list) => list && list.filter((row) => row.id !== id));
  }

  const count = tokens?.length ?? 0;
  const locked = busy !== null;
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US");

  return (
    <Section label={ts.aiLabel}>
      {revokeFailed && <p role="alert" className="text-sm mb-3" style={{ ...TEXT, color: "var(--danger)" }}>{t.connect.revokeFailed}</p>}
      <List>
        <Row
          name={ts.aiTitle}
          detail={loadFailed ? ts.aiLoadFailed : tokens === null ? "…" : count > 0 ? ts.aiBody(count) : ts.aiEmpty}
          action={count > 0 ? (
            <button type="button" onClick={() => { setOpen((v) => !v); setConfirmId(null); }} aria-expanded={open} style={pillStyle()}>
              {open ? ts.aiClose : ts.aiManage}
            </button>
          ) : undefined}
        />
        {open && tokens?.map((row) => (
          <Row key={row.id} divider name={tokenName(row.name, t)}
            // 앞자리만 고정폭 — 날짜까지 고정폭이면 폰에서 "2026. 9. / 22."처럼 날짜 가운데가 끊겼다.
            detail={
              <>
                <span className="vf-mono">{row.token_prefix}</span>
                {" · "}
                <span style={{ whiteSpace: "nowrap" }}>
                  {row.last_used_at ? t.connect.lastUsed(dateFmt(row.last_used_at)) : t.connect.neverUsed}
                </span>
              </>
            }
            action={confirmId === row.id ? undefined : (
              <button type="button" className="vf-button-text shrink-0" disabled={locked}
                onClick={() => { setConfirmId(row.id); setRevokeFailed(false); }}
                style={{ opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}>
                {t.connect.revoke}
              </button>
            )}>
            {confirmId === row.id && (
              <InlineConfirm locked={locked}
                text={t.connect.revokeConfirm}
                yes={busy === row.id ? ts.revoking : t.connect.revoke}
                no={ts.cancel}
                onYes={() => revoke(row.id)}
                onNo={() => setConfirmId(null)} />
            )}
          </Row>
        ))}
      </List>
    </Section>
  );
}
