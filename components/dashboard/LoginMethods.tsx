"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import { GitHubIcon, GoogleIcon } from "@/components/SocialSignInButtons";
import {
  LINK_PROVIDERS, LINK_RETURN_PATH, canUnlink, isLinkProvider, isLinkResult, linkRedirectTo,
  type LinkProvider,
} from "@/lib/identityLink";

// 명함 탭 "로그인 방법"(2026-09-25) — 이 계정에 붙은 방법 목록 + 구글·깃허브 [연결]/[해제].
// 왜·함정은 lib/identityLink 머리 주석. 이메일 줄은 늘 맨 위이고 버튼이 없다 — 메일 코드 로그인은
// 계정 메일로 언제나 되고(구글로 가입한 계정도), 계정 메일을 쥔 방법은 떼지 않는다(canUnlink).
// 줄 모양은 토스 ListRow(아이콘 · 이름/메일 · 오른쪽 조작), 글자는 15 이름 · 14 설명 · 13 메일.
const NAME: Record<LinkProvider, string> = { google: "Google", github: "GitHub" };
const ICON: Record<LinkProvider, () => React.ReactElement> = { google: GoogleIcon, github: GitHubIcon };
const CONTACT = "mailto:vivestarter@gmail.com";

type Notice =
  | { kind: "linked" | "taken" | "unlinked"; provider: LinkProvider }
  | { kind: "failed" | "startFailed" | "unlinkFailed" };

// 공급자 화면에서 돌아온 결과 — /auth/callback이 붙인 link=·provider=.
function noticeFromUrl(params: { get(name: string): string | null }): Notice | null {
  const result = params.get("link");
  const provider = params.get("provider");
  if (!isLinkResult(result)) return null;
  if (result === "failed") return { kind: "failed" };
  return isLinkProvider(provider) ? { kind: result, provider } : null;
}

// 조작 버튼 — soft 목록 위라 한 단계 진한 채움(--surface-active). 14px = 창 안 보조 버튼.
const pill: React.CSSProperties = {
  fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.4, padding: "0.4rem 0.95rem",
  borderRadius: 999, border: "none", background: "var(--surface-active)", color: "var(--text-primary)",
  fontFamily: "var(--font-nunito)", whiteSpace: "nowrap", cursor: "pointer",
};

// 줄 사이 구분 — soft 채움 위에 바탕색 1px(테두리 색은 다크에서 채움과 거의 같아 안 보였다).
const DIVIDER: React.CSSProperties = { borderTop: "1px solid var(--bg)" };

export default function LoginMethods({ accountEmail }: { accountEmail: string }) {
  const { t } = useT();
  const tl = t.loginMethods;
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState<Notice | null>(() => noticeFromUrl(searchParams));
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 누른 공급자(연결 — 곧 공급자 화면으로 넘어간다) 또는 해제 중인 identity_id. 있으면 버튼을 다 잠근다.
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    createClient().auth.getUserIdentities()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setLoadFailed(true);
        else setIdentities(data.identities);
      })
      .catch(() => { if (alive) setLoadFailed(true); });
    return () => { alive = false; };
  }, [reloadKey]);

  // 결과 표식은 읽었으면 주소에서 지우고(새로고침에 다시 뜨지 않게), 이 칸이 보이게 내려 준다 —
  // 명함 탭 아래쪽이라 돌아온 첫 화면엔 안 보인다.
  useEffect(() => {
    if (!searchParams.get("link")) return;
    window.history.replaceState({}, "", LINK_RETURN_PATH);
    sectionRef.current?.scrollIntoView({ block: "center" });
  }, [searchParams]);

  // 공급자 화면에서 뒤로 가기로 돌아오면 페이지가 캐시째 되살아나 "이동 중…"에 멈춰 있다.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setBusy(null); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function link(provider: LinkProvider) {
    setBusy(provider);
    setNotice(null);
    setConfirmId(null);
    try {
      const { error } = await createClient().auth.linkIdentity({
        provider,
        options: { redirectTo: linkRedirectTo(window.location.origin, provider) },
      });
      // 성공이면 linkIdentity가 공급자 화면으로 보낸다. 실패 대표 사례: 대시보드의
      // "Allow manual linking"이 꺼져 있다(manual_linking_disabled).
      if (!error) return;
    } catch {
      // 아래 안내로
    }
    setBusy(null);
    setNotice({ kind: "startFailed" });
  }

  async function unlink(identity: UserIdentity, provider: LinkProvider) {
    setBusy(identity.identity_id);
    let failed = false;
    try {
      failed = !!(await createClient().auth.unlinkIdentity(identity)).error;
    } catch {
      failed = true;
    }
    setBusy(null);
    setConfirmId(null);
    if (failed) {
      setNotice({ kind: "unlinkFailed" });
      return;
    }
    setIdentities((list) => list && list.filter((i) => i.identity_id !== identity.identity_id));
    setNotice({ kind: "unlinked", provider });
  }

  const locked = busy !== null;
  // 공급자마다 붙은 방법 전부(보통 하나), 없으면 [연결] 줄 하나.
  const socialRows = LINK_PROVIDERS.flatMap((provider) => {
    const mine = (identities ?? []).filter((i) => i.provider === provider);
    return mine.length
      ? mine.map((identity) => ({ provider, identity }))
      : [{ provider, identity: null as UserIdentity | null }];
  });
  const hasEmailRow = accountEmail !== "";

  return (
    // keep-all — 폰 폭에서 "이 계정이/에요"처럼 낱말 가운데가 끊겼다(09-25 360px 실측).
    <div ref={sectionRef} className="pt-2" style={{ wordBreak: "keep-all" }}>
      <p className="vf-label">{tl.label}</p>
      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
        {tl.intro}
      </p>

      {notice && <NoticeView notice={notice} />}

      <ul className="rounded-2xl overflow-hidden" style={{ background: "var(--surface-soft)" }}>
        {hasEmailRow && <Row icon={<MailIcon />} name={tl.email} detail={accountEmail} />}

        {identities === null ? (
          <li className="px-4 py-3.5 flex items-center gap-3 flex-wrap" style={hasEmailRow ? DIVIDER : undefined}>
            {loadFailed ? (
              <>
                <span className="text-sm" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{tl.loadFailed}</span>
                <button type="button" className="vf-button-text" style={{ textDecoration: "underline" }}
                  onClick={() => { setLoadFailed(false); setReloadKey((k) => k + 1); }}>
                  {tl.retry}
                </button>
              </>
            ) : (
              <span className="vf-spinner" aria-hidden="true" />
            )}
          </li>
        ) : socialRows.map(({ provider, identity }, i) => {
          const Icon = ICON[provider];
          const divider = hasEmailRow || i > 0;
          if (!identity) {
            return (
              <Row key={provider} divider={divider} icon={<Icon />} name={NAME[provider]} detail={tl.notLinked}
                action={
                  <button type="button" onClick={() => link(provider)} disabled={locked}
                    style={{ ...pill, opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}>
                    {busy === provider ? tl.linking : tl.link}
                  </button>
                } />
            );
          }
          const email = typeof identity.identity_data?.email === "string" ? identity.identity_data.email : "";
          const removable = canUnlink(identity, identities, accountEmail);
          const confirming = confirmId === identity.identity_id;
          return (
            <Row key={identity.identity_id} divider={divider} icon={<Icon />} name={NAME[provider]} detail={email}
              action={removable && !confirming ? (
                <button type="button" className="vf-button-text shrink-0" disabled={locked}
                  onClick={() => { setConfirmId(identity.identity_id); setNotice(null); }}
                  style={{ opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}>
                  {tl.unlink}
                </button>
              ) : undefined}>
              {confirming && (
                // 줄 안에서 펼친다 — 되돌릴 수 있는 일(다시 연결하면 된다)이라 창을 띄우지 않는다.
                <div className="mt-3 pl-8">
                  <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
                    {tl.unlinkConfirm(NAME[provider])}
                  </p>
                  <div className="flex items-center gap-4 mt-2.5">
                    <button type="button" onClick={() => unlink(identity, provider)} disabled={locked}
                      style={{ ...pill, opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}>
                      {busy === identity.identity_id ? tl.unlinking : tl.unlinkYes}
                    </button>
                    <button type="button" className="vf-button-text" disabled={locked} onClick={() => setConfirmId(null)}>
                      {tl.cancel}
                    </button>
                  </div>
                </div>
              )}
            </Row>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ icon, name, detail, action, divider = false, children }: {
  icon: React.ReactNode; name: string; detail?: string; action?: React.ReactNode;
  divider?: boolean; children?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-3.5" style={divider ? DIVIDER : undefined}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-5 flex justify-center" style={{ color: "var(--text-primary)" }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.4, color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {name}
          </p>
          {detail && (
            <p className="truncate" style={{ fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              {detail}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </li>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  const { t } = useT();
  const tl = t.loginMethods;
  const text = { fontFamily: "var(--font-nunito)", lineHeight: 1.6 } as const;

  if (notice.kind === "taken") {
    return (
      <div role="alert" className="mb-3 rounded-2xl px-4 py-3.5" style={{ background: "var(--blue-tint)" }}>
        <p className="text-sm font-bold" style={{ ...text, color: "var(--text-primary)" }}>{tl.takenTitle(NAME[notice.provider])}</p>
        <p className="text-sm mt-1" style={{ ...text, color: "var(--text-secondary)" }}>{tl.takenBody}</p>
        <a href={CONTACT} className="inline-block text-sm mt-2"
          style={{ ...text, color: "var(--text-primary)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
          {tl.contact}
        </a>
      </div>
    );
  }
  if (notice.kind === "linked" || notice.kind === "unlinked") {
    const msg = notice.kind === "linked" ? tl.linked(NAME[notice.provider]) : tl.unlinked(NAME[notice.provider]);
    return (
      <p role="status" className="text-sm mb-3 flex items-start gap-1.5" style={{ ...text, color: "var(--text-secondary)" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" style={{ marginTop: "0.3rem" }} aria-hidden="true">
          <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {msg}
      </p>
    );
  }
  const msg = notice.kind === "failed" ? tl.failed : notice.kind === "startFailed" ? tl.startFailed : tl.unlinkFailed;
  return <p role="alert" className="text-sm mb-3" style={{ ...text, color: "var(--danger)" }}>{msg}</p>;
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 5.2L9 9.6l6.2-4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
