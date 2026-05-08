import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }} />
          <span className="font-black text-base" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            Vibefolio
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-full font-bold text-sm"
            style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", textDecoration: "none" }}
          >
            시작하기
          </Link>
        </div>
      </nav>

      {/* Hero — vertically centered in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">

        {/* Headline */}
        <h1
          className="font-black leading-tight mb-6"
          style={{
            fontFamily: "var(--font-nunito)",
            color: "var(--text-primary)",
            fontSize: "clamp(2.6rem, 6vw, 5rem)",
            letterSpacing: "-0.03em",
          }}
        >
          AI로 만든 결과물,<br />
          <span style={{
            background: "linear-gradient(120deg, var(--blue) 0%, var(--blue-bright) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            이제 보여주세요.
          </span>
        </h1>

        {/* CTA buttons */}
        <div className="flex items-center gap-3 mb-20">
          <Link
            href="/signup"
            className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-80"
            style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", textDecoration: "none", boxShadow: "0 0 24px var(--blue-glow)" }}
          >
            무료로 시작하기
          </Link>
          <Link
            href="/demo"
            className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-70"
            style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}
          >
            데모 보기
          </Link>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-10">
          <Stat value="1,000+" label="바이브코더" />
          <div className="w-px h-8" style={{ background: "var(--border)" }} />
          <Stat value="5,000+" label="업로드된 프로젝트" />
        </div>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-center py-6">
        <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          © {new Date().getFullYear()} Vibefolio
        </p>
      </footer>

    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-2xl font-black"
        style={{
          fontFamily: "var(--font-nunito)",
          background: "linear-gradient(120deg, var(--blue), var(--blue-bright))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {value}
      </span>
      <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
        {label}
      </span>
    </div>
  );
}
