import Link from "next/link";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";

// 로그인·가입 문(AuthDoor)과 비밀번호 찾기·재설정 화면이 같이 쓰는 조각(2026-10-02 덜어내기 2차).
// 한 화면에 할 일 하나 — 가운데 한 칸(384px)에 세리프 제목, 글자 길이만 한 알약 버튼 하나,
// 그 밑에 작은 밑줄 글 링크. 색은 전부 토큰이라 다크에서도 그대로 맞는다.

/** 머리(로고 + 언어)와 가운데 한 칸. 만료 화면처럼 머리 없이 쓸 때는 header={false}. */
export function AuthShell({ header = true, children }: { header?: boolean; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {header && (
        <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
          <Logo />
          <LanguageToggle />
        </nav>
      )}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}

export function AuthTitle({ children, className = "", size = "1.875rem" }: {
  children: React.ReactNode; className?: string; size?: string;
}) {
  return (
    <h1 className={`vf-serif-display text-center ${className}`}
      style={{ fontSize: size, fontWeight: 600, lineHeight: 1.25 }}>
      {children}
    </h1>
  );
}

/** 주 버튼 — 꽉 찬 막대 대신 글자 길이만 한 알약, 가운데(flex 세로 칸 안에서). Link로 쓸 땐 PILL_STYLE. */
export const PILL_STYLE: React.CSSProperties = { minWidth: 180, padding: "0.8rem 2rem", fontSize: "0.9375rem" };

export function Pill({ className = "", style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`vf-button-primary self-center ${className}`} style={{ ...PILL_STYLE, ...style }} />;
}

/** 작은 밑줄 글 — 방법 바꾸기·다시 받기·돌아가기 같은 곁길. */
const SMALL_STYLE: React.CSSProperties = {
  fontSize: "0.8125rem", color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: 3,
};

export function SmallButton({ className = "", style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`vf-button-text disabled:opacity-50 ${className}`} style={{ ...SMALL_STYLE, ...style }} />;
}

export function SmallLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="vf-button-text" style={SMALL_STYLE}>{children}</Link>;
}

/** 곁길 링크 한 줄(가운데). 둘 이상이면 사이에 ·를 넣어 부른다. */
export function SmallRow({ children, className = "mt-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2.5 ${className}`}
      style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

/** 칸 이름표 줄 — 오른쪽에 "지난번에 사용"·"비밀번호 찾기" 같은 곁가지를 둘 수 있다. */
export function FieldLabel({ htmlFor, children, right, className = "" }: {
  htmlFor: string; children: React.ReactNode; right?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-1.5 ${className}`}>
      <label htmlFor={htmlFor} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
        {children}
      </label>
      {right}
    </div>
  );
}

export function ErrorLine({ text, className = "mt-3" }: { text: string; className?: string }) {
  return (
    <p role="alert" className={`text-center ${className}`}
      style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--danger)", wordBreak: "keep-all" }}>
      {text}
    </p>
  );
}
