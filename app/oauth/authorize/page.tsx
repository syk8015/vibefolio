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

/** 이 화면의 버튼 — 글자 길이대로(꽉 찬 막대 없음) 알약 모양, 15px. 옆 여백 20px이면
 *  375px 폭에서도 [닫기][허용하고 돌아가기]가 한 줄에 들어간다(영어 포함). */
const BUTTON: React.CSSProperties = { fontSize: "0.9375rem", padding: "0.75rem 1.25rem" };

export default async function AuthorizePage({ searchParams }: { searchParams: Search }) {
  const { t } = await getT();
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") params.set(k, v);

  // decision 라우트가 "돌려줄 수 없는 실패"를 여기로 보낸다 — 그대로 띄운다.
  const passedError = params.get("error");
  if (passedError) {
    return <Card><ErrorBody t={t} message={params.get("error_description") || passedError} /></Card>;
  }

  // 로그인 확인이 **먼저**다. 승인할 사람이 없으면 검증할 이유도 없고, 무엇보다
  // client_id URL을 가져오는 바깥 요청(CIMD)을 로그인 안 한 사람이 시킬 수 없게 된다.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Card>
        <h1 className="vf-serif-display" style={{ fontSize: "1.5rem", fontWeight: 500, lineHeight: 1.3, margin: "0 0 8px" }}>
          {t.oauth.loginTitle}
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
          {t.oauth.loginBody}
        </p>
        <Link href="/login" className="vf-button-primary" style={{ ...BUTTON, marginTop: 20 }}>
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
    return <Card><ErrorBody t={t} message={check.error.message} /></Card>;
  }

  const { req } = check;
  const clientHost = new URL(req.clientId).host;
  const redirectHost = new URL(req.redirectUri).hostname;
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(redirectHost);

  // 가운데 정렬 한 줄기(10-01 덜어내기 라): 주소 → 이름 → 질문 → 할 수 있는 일 두 줄 → 못 하는 일 한 줄
  // → (내 컴퓨터면 경고) → [닫기][허용하고 돌아가기] → 돌아갈 곳 → 끊는 곳.
  return (
    <Card>
      {/* 가장 큰 글씨 = 주소. 이름이 아니다. */}
      <p className="vf-serif-display" style={{ fontSize: "clamp(1.6rem, 6vw, 2.0625rem)", fontWeight: 600, lineHeight: 1.15, margin: 0, wordBreak: "break-all" }}>
        {clientHost}
      </p>
      {req.doc.client_name && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "4px 0 0", overflowWrap: "anywhere" }}>
          {t.oauth.selfName(req.doc.client_name)}
        </p>
      )}

      <h1 className="vf-serif-display" style={{ fontSize: "1.375rem", fontWeight: 500, lineHeight: 1.3, margin: "22px 0 10px" }}>
        {t.oauth.title}
      </h1>

      <ul style={{ listStyle: "none", margin: "0 0 6px", padding: 0, fontSize: "0.9375rem", lineHeight: 1.8, color: "var(--text-primary)" }}>
        <li>{t.oauth.can1}</li>
        <li>{t.oauth.can2}</li>
      </ul>
      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0 0 22px" }}>
        {t.oauth.cannot}
      </p>

      {isLoopback && (
        <p className="rounded-2xl" style={{ fontSize: "0.8125rem", color: "var(--text-primary)", background: "var(--surface-soft)", lineHeight: 1.7, padding: "12px 14px", margin: "0 0 16px" }}>
          {t.oauth.loopbackWarn}
        </p>
      )}

      {/* 원래 요청을 그대로 실어 보낸다 — decision 라우트가 같은 값으로 다시 검증한다. */}
      <form method="POST" action="/api/oauth/authorize/decision" className="flex flex-wrap items-center justify-center gap-2.5">
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
        <button type="submit" name="decision" value="deny" className="vf-button-ghost" style={BUTTON}>
          {t.oauth.deny}
        </button>
        <button type="submit" name="decision" value="allow" className="vf-button-primary" style={BUTTON}>
          {t.oauth.allow}
        </button>
      </form>

      {/* 돌아갈 곳은 버튼 바로 밑 — 누르기 직전에 눈에 들어와야 한다(속임 방지). */}
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "10px 0 0", overflowWrap: "anywhere" }}>
        {t.oauth.returnTo(redirectHost)}
      </p>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: "16px 0 0" }}>
        {t.oauth.revokeNote}
      </p>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="flex items-center justify-end mb-6">
          <LanguageToggle />
        </div>
        <div className="rounded-2xl flex flex-col items-center text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "26px 24px", wordBreak: "keep-all", overflowWrap: "break-word" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// 오류는 쉬운 말 한 줄 + [대시보드로]. 받은 원문(영어)은 '자세히' 안에 — 만든 쪽에 전할 때 그대로 복사한다.
function ErrorBody({ t, message }: { t: Dictionary; message: string }) {
  return (
    <>
      <h1 className="vf-serif-display" style={{ fontSize: "1.625rem", fontWeight: 500, lineHeight: 1.3, margin: "0 0 6px" }}>
        {t.oauth.errorTitle}
      </h1>
      <p style={{ fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
        {t.oauth.errorBody}
      </p>
      <Link href="/dashboard" className="vf-button-primary" style={{ ...BUTTON, marginTop: 20 }}>
        {t.oauth.backToDashboard}
      </Link>
      <details className="mt-4" style={{ maxWidth: "100%" }}>
        <summary className="cursor-pointer" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
          {t.oauth.errorDetails}
        </summary>
        <p className="vf-mono" style={{ margin: "8px 0 0", padding: "10px 14px", borderRadius: 10, background: "var(--surface-soft)", fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
          {message}
        </p>
      </details>
    </>
  );
}
