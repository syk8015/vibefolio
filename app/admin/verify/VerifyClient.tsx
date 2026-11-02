"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FoldToggle } from "@/components/FoldToggle";
import { AuthShell, AuthTitle, ErrorLine, FieldLabel, Pill, SmallLink, SmallRow } from "@/components/auth/AuthParts";

// 관리자 인증 앱 화면(page.tsx가 상태를 정한다). 6자리 확인·등록은 브라우저가 Supabase에 바로 하고,
// 끝나면 로그인이 aal2로 올라 쿠키가 바뀐다 → 서버의 관리자 문(lib/routeAuth.ts checkAdmin)이 열린다.

export type VerifyMode = "code" | "blocked" | "enroll" | "done";

const WRONG_CODE = "숫자가 맞지 않아요. 앱에 지금 떠 있는 6자리를 넣어 주세요.";

function digits(v: string) {
  return v.replace(/\D/g, "").slice(0, 6);
}

function friendlyError(message: string | undefined) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid") || m.includes("expired") || m.includes("code")) return WRONG_CODE;
  if (m.includes("rate") || m.includes("too many")) return "너무 여러 번 틀렸어요. 몇 분 뒤에 다시 넣어 주세요.";
  return "확인하지 못했어요. 다시 눌러 주세요.";
}

function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <FieldLabel htmlFor="totp-code">인증 앱 6자리</FieldLabel>
      <input
        id="totp-code"
        className="vf-input vf-mono"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        placeholder="000000"
        value={value}
        onChange={(e) => onChange(digits(e.target.value))}
        style={{ fontSize: "1.25rem", letterSpacing: "0.3em", textAlign: "center" }}
        autoFocus
        required
      />
    </>
  );
}

const lead: React.CSSProperties = { fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-secondary)" };

export function VerifyClient({ mode, factorId, next, country }: {
  mode: VerifyMode; factorId: string | null; next: string; country: string | null;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError("");
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setBusy(false);
      setCode("");
      setError(friendlyError(err.message));
      return;
    }
    // 메일의 [비상 정지 열기](/admin#stop)처럼 #이 붙어 왔으면 그대로 이어 간다.
    window.location.assign(next + window.location.hash);
  }

  async function startEnroll() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    // 끝내지 않은 지난 등록이 있으면 지운다(같은 이름은 두 번 못 만든다).
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Nookframe 관리자 ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (err || !data) {
      setError("등록을 시작하지 못했어요. 다시 눌러 주세요.");
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function finishEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll || code.length !== 6) return;
    setBusy(true);
    setError("");
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (err) {
      setCode("");
      setError(friendlyError(err.message));
      return;
    }
    setEnrolled(true);
  }

  if (mode === "blocked") {
    return (
      <AuthShell header={false}>
        <AuthTitle className="mb-4">여기서는 열 수 없어요</AuthTitle>
        <p className="text-center" style={lead}>
          집 나라 밖({country ?? "?"})에서는 인증 앱 6자리가 있어야 관리자 화면이 열려요. 아직 등록한 인증 앱이
          없어서 열 수 없어요. 집 나라에서 이 화면을 다시 열어 먼저 등록해 주세요.
        </p>
      </AuthShell>
    );
  }

  if (mode === "code") {
    return (
      <AuthShell header={false}>
        <AuthTitle className="mb-3">인증 앱 확인</AuthTitle>
        <p className="text-center mb-7" style={lead}>
          처음 보는 나라({country ?? "?"})에서 열었어요. 인증 앱의 6자리를 넣으면 이 로그인이 끝날 때까지 열려요.
        </p>
        <form onSubmit={verify} className="flex flex-col">
          <CodeField value={code} onChange={(v) => { setCode(v); setError(""); }} />
          {error && <ErrorLine text={error} />}
          <Pill type="submit" disabled={busy || code.length !== 6} className="mt-6">
            {busy ? "확인 중…" : "관리자 화면 열기"}
          </Pill>
        </form>
      </AuthShell>
    );
  }

  if (mode === "done" || enrolled) {
    return (
      <AuthShell header={false}>
        <AuthTitle className="mb-3">{enrolled ? "등록했어요" : "인증 앱이 등록돼 있어요"}</AuthTitle>
        <p className="text-center" style={lead}>
          집 나라 밖에서는 이 앱의 6자리를 넣어야 관리자 화면이 열려요.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <FoldToggle open={showLost} onToggle={() => setShowLost((v) => !v)}>휴대폰을 잃어버렸다면</FoldToggle>
          {showLost && (
            <p style={{ ...lead, fontSize: "0.875rem" }}>
              Supabase › Authentication › Users에서 내 계정을 열고 MFA 항목의 인증 수단을 지워요. 그다음 집 나라에서
              이 화면을 열어 새 휴대폰으로 다시 등록해요.
            </p>
          )}
        </div>
        <SmallRow className="mt-6">
          <SmallLink href="/admin">관제탑으로</SmallLink>
        </SmallRow>
      </AuthShell>
    );
  }

  // enroll
  return (
    <AuthShell header={false}>
      <AuthTitle className="mb-3">인증 앱 등록</AuthTitle>
      <p className="text-center mb-7" style={lead}>
        등록하면 집 나라 밖에서는 이 앱의 6자리를 넣어야 관리자 화면이 열려요. 마치면 다른 기기의 로그인은 끊겨요.
      </p>
      {!enroll ? (
        <div className="flex flex-col items-center">
          {error && <ErrorLine text={error} className="mb-4" />}
          <Pill onClick={startEnroll} disabled={busy}>{busy ? "준비 중…" : "QR 코드 만들기"}</Pill>
        </div>
      ) : (
        <form onSubmit={finishEnroll} className="flex flex-col">
          <p className="text-center mb-3" style={{ ...lead, fontSize: "0.875rem" }}>
            Google Authenticator 같은 인증 앱으로 찍어요.
          </p>
          <div
            className="mx-auto mb-3 p-3 rounded-xl"
            // ui-allow: color QR은 다크 모드에서도 흰 바탕이어야 앱이 읽는다
            style={{ background: "#fff", width: 200, height: 200 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase가 준 data: SVG, 최적화할 게 없다 */}
            <img src={enroll.qr} alt="인증 앱 등록 QR 코드" width={176} height={176} />
          </div>
          <div className="flex flex-col items-center gap-2 mb-6">
            <FoldToggle open={showSecret} onToggle={() => setShowSecret((v) => !v)}>QR이 안 찍히면</FoldToggle>
            {showSecret && (
              <code className="vf-mono text-center" style={{ fontSize: "0.875rem", overflowWrap: "anywhere", color: "var(--text-primary)" }}>
                {enroll.secret}
              </code>
            )}
          </div>
          <CodeField value={code} onChange={(v) => { setCode(v); setError(""); }} />
          {error && <ErrorLine text={error} />}
          <Pill type="submit" disabled={busy || code.length !== 6} className="mt-6">
            {busy ? "확인 중…" : "등록 마치기"}
          </Pill>
        </form>
      )}
    </AuthShell>
  );
}
