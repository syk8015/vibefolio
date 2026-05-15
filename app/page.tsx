import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeProfileMenu from "@/components/HomeProfileMenu";
import PortfolioPipSection from "@/components/PortfolioPipSection";
import ThemeToggle from "@/components/ThemeToggle";
import GlitchHeadline from "@/components/GlitchHeadline";
import LoggedInHeadline from "@/components/LoggedInHeadline";
import HowItWorksSection from "@/components/HowItWorksSection";

const STAT_TAGLINES = [
  "나랑 같은 토큰을 쓰는 동료",
  "ChatGPT한테 \"왜 안 돼요\" 물어본 사람",
  "스택오버플로우 대신 AI한테 물어본 사람",
  "Ctrl+C 없이도 뭔가 만든 사람",
  "기획자이자 디자이너이자 개발자인 사람",
  "혼자서 팀 하나를 대신하는 사람",
  "AI를 팀원으로 둔 솔로 창업자",
  "아이디어만으로 제품을 만든 빌더",
  "코드보다 아이디어가 먼저인 사람",
  "프롬프트로 제품을 만드는 사람",
];

function formatCount(n: number): string {
  if (n < 10) return String(n);
  return n.toLocaleString("ko-KR") + "+";
}

interface FeaturedProfile {
  username: string;
  name: string | null;
}

export default async function LandingPage() {
  const supabase = await createClient();

  const [
    { data: { user } },
    { count: userCount },
    { data: featuredProfiles },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles")
      .select("username, name")
      .order("updated_at", { ascending: true })
      .limit(20),
  ]);

  const tagline = STAT_TAGLINES[Math.floor(Math.random() * STAT_TAGLINES.length)];

  const meta = user?.user_metadata || {};
  const username = meta.username || user?.email?.split("@")[0] || "";
  const name = meta.name || username;
  const avatarUrl = meta.avatar_url as string | undefined;

  const profiles = (featuredProfiles as FeaturedProfile[] | null) ?? [];

  /* ─── Logged-in home ─── */
  if (user) {
    return (
      <main className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
        <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <HomeProfileMenu username={username} name={name} avatarUrl={avatarUrl} />
          </div>
        </nav>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <p className="text-sm font-bold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            안녕하세요, <span style={{ color: "var(--blue)" }}>{name}</span>님!
          </p>
          <LoggedInHeadline />
          <div className="flex flex-wrap justify-center items-center gap-3 mt-4">
            <Link href={`/${username}`}
              className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-80"
              style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", textDecoration: "none", boxShadow: "0 0 24px var(--blue-glow)" }}>
              내 명함 보기
            </Link>
            <Link href="/dashboard"
              className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-70"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
              명함 수정
            </Link>
          </div>
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            vibefolio.vercel.app/<span style={{ color: "var(--blue-bright)" }}>{username}</span>
          </p>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-6">
          <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>이용약관</Link>
          <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>개인정보처리방침</Link>
          <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>문의</a>
          <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Vibefolio</span>
        </footer>
      </main>
    );
  }

  /* ─── Public landing ─── */
  return (
    <main className="flex flex-col" style={{ background: "var(--bg)", overflowX: "clip" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 relative z-10">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}>
            로그인
          </Link>
          <Link href="/signup"
            className="px-4 py-2 rounded-full font-bold text-sm"
            style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
            시작하기
          </Link>
        </div>
      </nav>

      {/* Hero — centered, full viewport height */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 min-h-[calc(100vh-72px)]">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div style={{
            position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
            width: 700, height: 500, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(77,158,255,0.08) 0%, transparent 70%)",
            filter: "blur(40px)",
          }} />
        </div>

        {/* Chip */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8"
          style={{ background: "var(--blue-tint)", border: "1px solid var(--border-bright)" }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--blue)", boxShadow: "0 0 6px var(--blue)" }} />
          <span className="text-xs font-bold tracking-wider" style={{ color: "var(--blue-bright)", fontFamily: "var(--font-nunito)" }}>
            바이브코더를 위한 디지털 명함
          </span>
        </div>

        <h1
          className="font-black leading-tight mb-5 z-10"
          style={{ fontFamily: "var(--font-nunito)", color: "var(--text-primary)", fontSize: "clamp(2.6rem, 5vw, 4.5rem)", letterSpacing: "-0.03em" }}
        >
          <GlitchHeadline />,<br />
          <span style={{ background: "linear-gradient(120deg, var(--blue) 0%, var(--blue-bright) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            이제 보여주세요.
          </span>
        </h1>

        <p className="mb-10 leading-relaxed z-10 max-w-md" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "1rem", fontWeight: 400 }}>
          링크 하나로 나의 바이브코딩 결과물을 전시하세요.<br />
          5분 안에 나만의 포트폴리오 명함이 완성됩니다.
        </p>

        <div className="flex flex-wrap justify-center items-center gap-3 mb-12 z-10">
          <Link href="/signup"
            className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-80"
            style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", textDecoration: "none", boxShadow: "0 0 24px var(--blue-glow)" }}>
            무료로 시작하기
          </Link>
          <Link href="/login"
            className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-70"
            style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
            로그인
          </Link>
        </div>

        {/* Social proof */}
        <p className="text-sm font-semibold z-10" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          {tagline}{" "}
          <span style={{ color: "var(--blue)", fontWeight: 800 }}>{formatCount(userCount ?? 0)}명</span>
          이 사용중이에요
        </p>

        {/* Scroll hint */}
        {profiles.length > 0 && (
          <div className="absolute bottom-10 flex flex-col items-center gap-2 animate-bounce">
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              실제 명함 보기
            </p>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 9l5 5 5-5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </section>

      {/* How it works — scroll-driven */}
      <HowItWorksSection />

      {/* PiP portfolio preview — scroll-synced, cycles through profiles */}
      {profiles.length > 0 && (
        <PortfolioPipSection profiles={profiles} />
      )}

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-6 relative z-10" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>이용약관</Link>
        <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>개인정보처리방침</Link>
        <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>문의</a>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Vibefolio</span>
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }} />
      <span className="font-black text-base" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
        Vibefolio
      </span>
    </div>
  );
}


