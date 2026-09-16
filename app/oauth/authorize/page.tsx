import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/lib/i18n/server";
import LanguageToggle from "@/components/LanguageToggle";
import { validateAuthorizeParams } from "@/lib/oauth";
import type { Dictionary } from "@/lib/i18n/dictionaries";

// /oauth/authorize — 원격 MCP 커넥터의 인증 화면(2026-09-17). OAuth의 authorization
// endpoint는 기계가 부르는 API가 아니라 **사람이 보고 누르는 페이지**라 여기 있다.
//
// 이 화면의 핵심은 예쁜 것이 아니라 **무엇을 크게 보여 주느냐**다. 클라이언트가 스스로
// 올린 설명서의 이름(client_name)은 아무나 "Claude"라고 적을 수 있다. 그래서 큰 글씨는
// 언제나 client_id URL의 **호스트**이고, 이름은 "스스로 밝힌 이름"이라고 못박아 작게 쓴다.

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Connect · Nookframe" : "연결 확인 · Nookframe" };
}

/** 이 화면은 쿠키와 검색 파라미터를 읽는다 — 절대 캐시되면 안 된다. */
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AuthorizePage({ searchParams }: { searchParams: Search }) {
  const { t } = await getT();
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") params.set(k, v);

  // decision 라우트가 "돌려줄 수 없는 실패"를 여기로 보낸다 — 그대로 띄운다.
  const passedError = params.get("error");
  if (passedError) {
    return <Card t={t}><ErrorBody t={t} message={params.get("error_description") || passedError} /></Card>;
  }

  // 로그인 확인이 **먼저**다. 승인할 사람이 없으면 검증할 이유도 없고, 무엇보다
  // client_id URL을 가져오는 바깥 요청(CIMD)을 로그인 안 한 사람이 시킬 수 없게 된다.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Card t={t}>
        <h1 className="vf-serif-display mb-2" style={{ fontSize: "clamp(1.4rem, 4vw, 1.75rem)", fontWeight: 500 }}>
          {t.oauth.loginTitle}
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.8 }}>
          {t.oauth.loginBody}
        </p>
        <Link href="/login" className="vf-button-primary inline-block mt-5" style={{ textDecoration: "none" }}>
          {t.oauth.loginCta}
        </Link>
      </Card>
    );
  }

  const check = await validateAuthorizeParams(params);
  if (!check.ok) {
    // 돌려줄 주소를 믿을 수 있으면 규약대로 클라이언트에게 실패를 전한다.
    if (check.redirectTo) {
      const url = new URL(check.redirectTo);
      url.searchParams.set("error", check.error.code);
      url.searchParams.set("error_description", check.error.message);
      if (check.state) url.searchParams.set("state", check.state);
      redirect(url.toString());
    }
    return <Card t={t}><ErrorBody t={t} message={check.error.message} /></Card>;
  }

  const { req } = check;
  const clientHost = new URL(req.clientId).host;
  const redirectHost = new URL(req.redirectUri).hostname;
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(redirectHost);

  return (
    <Card t={t}>
      <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
        {t.oauth.hostLead}
      </p>
      {/* 가장 큰 글씨 = 주소. 이름이 아니다. */}
      <p className="vf-serif-display" style={{ fontSize: "clamp(1.5rem, 5vw, 2rem)", fontWeight: 500, margin: "6px 0 2px", wordBreak: "break-all" }}>
        {clientHost}
      </p>
      {req.doc.client_name && (
        <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
          {t.oauth.selfName(req.doc.client_name)}
        </p>
      )}

      <h1 className="vf-serif-display mt-6 mb-5" style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.5rem)", fontWeight: 500 }}>
        {t.oauth.title}
      </h1>

      <Section title={t.oauth.canTitle} items={[t.oauth.can1, t.oauth.can2]} />
      <Section title={t.oauth.cannotTitle} items={[t.oauth.cannot1, t.oauth.cannot2, t.oauth.cannot3]} muted />

      {isLoopback && (
        <p className="text-xs rounded-2xl" style={{ color: "var(--text-primary)", background: "var(--surface-soft)", fontFamily: "var(--font-nunito)", lineHeight: 1.7, padding: "12px 14px", margin: "0 0 14px" }}>
          {t.oauth.loopbackWarn}
        </p>
      )}

      <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7, marginBottom: 18 }}>
        {t.oauth.returnTo(redirectHost)}
      </p>

      {/* 원래 요청을 그대로 실어 보낸다 — decision 라우트가 같은 값으로 다시 검증한다. */}
      <form method="POST" action="/api/oauth/authorize/decision" className="flex items-center gap-3">
        {([
          ["client_id", req.clientId],
          ["redirect_uri", req.redirectUri],
          ["state", req.state],
          ["code_challenge", req.codeChallenge],
          ["code_challenge_method", "S256"],
          ["response_type", "code"],
          ["resource", req.resource],
          ["scope", req.scope],
        ] as [string, string | null][]).map(([name, value]) =>
          value === null ? null : <input key={name} type="hidden" name={name} value={value} />,
        )}
        <button type="submit" name="decision" value="allow" className="vf-soft-fill rounded-full"
          style={{ padding: "0.6rem 1.4rem", fontFamily: "var(--font-nunito)", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer" }}>
          {t.oauth.allow}
        </button>
        <button type="submit" name="decision" value="deny" className="vf-button-ghost"
          style={{ fontSize: "0.85rem" }}>
          {t.oauth.deny}
        </button>
      </form>

      <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.7, margin: "18px 0 0" }}>
        {t.oauth.revokeNote}
      </p>
    </Card>
  );
}

function Card({ t, children }: { t: Dictionary; children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="flex items-center justify-end mb-6">
          <LanguageToggle />
        </div>
        <div className="rounded-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "26px 24px" }}>
          {children}
        </div>
        <p className="text-xs text-center mt-6">
          <Link href="/dashboard" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
            {t.oauth.backToDashboard}
          </Link>
        </p>
      </div>
    </div>
  );
}

function Section({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className="mb-4">
      <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontWeight: 600, margin: "0 0 6px" }}>
        {title}
      </p>
      <ul style={{ margin: 0, padding: "0 0 0 1.1rem" }}>
        {items.map((line) => (
          <li key={line} className="text-sm" style={{ color: muted ? "var(--text-secondary)" : "var(--text-primary)", fontFamily: "var(--font-nunito)", lineHeight: 1.8 }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorBody({ t, message }: { t: Dictionary; message: string }) {
  return (
    <>
      <h1 className="vf-serif-display mb-2" style={{ fontSize: "clamp(1.4rem, 4vw, 1.75rem)", fontWeight: 500 }}>
        {t.oauth.errorTitle}
      </h1>
      <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", lineHeight: 1.8, wordBreak: "break-word" }}>
        {message}
      </p>
      <p className="text-xs mt-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
        {t.oauth.errorHint}
      </p>
    </>
  );
}
