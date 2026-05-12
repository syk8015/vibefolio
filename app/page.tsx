import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeProfileMenu from "@/components/HomeProfileMenu";

const STAT_TAGLINES = [
  "나랑 같은 토큰을 쓰는 동료들",
  "ChatGPT한테 \"왜 안 돼요\" 물어본 사람들",
  "스택오버플로우 대신 AI한테 물어본 사람들",
  "Ctrl+C 없이도 뭔가 만든 사람들",
  "기획자이자 디자이너이자 개발자인 사람들",
  "혼자서 팀 하나를 대신하는 사람들",
  "AI를 팀원으로 둔 솔로 창업자들",
  "아이디어만으로 제품을 만든 빌더들",
  "코드보다 아이디어가 먼저인 사람들",
  "AI 네이티브 세대의 첫 포트폴리오",
];

function formatCount(n: number): string {
  if (n < 10) return String(n);
  return n.toLocaleString("ko-KR") + "+";
}

export default async function LandingPage() {
  const supabase = await createClient();

  const [
    { data: { user } },
    { count: userCount },
    { count: projectCount },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("projects").select("*", { count: "exact", head: true }),
  ]);

  const tagline = STAT_TAGLINES[Math.floor(Math.random() * STAT_TAGLINES.length)];

  const meta = user?.user_metadata || {};
  const username = meta.username || user?.email?.split("@")[0] || "";
  const name = meta.name || username;
  const avatarUrl = meta.avatar_url as string | undefined;
  const avatarLetter = name.charAt(0).toUpperCase();

  if (user) {
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

          <HomeProfileMenu username={username} name={name} avatarUrl={avatarUrl} />
        </nav>

        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <p className="text-sm font-bold mb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            안녕하세요, <span style={{ color: "var(--blue)" }}>{name}</span>님!
          </p>

          <h1
            className="font-black leading-tight mb-8"
            style={{
              fontFamily: "var(--font-nunito)",
              color: "var(--text-primary)",
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              letterSpacing: "-0.03em",
            }}
          >
            나의 명함을<br />
            <span style={{
              background: "linear-gradient(120deg, var(--blue) 0%, var(--blue-bright) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              세상에 공유하세요.
            </span>
          </h1>

          <div className="flex items-center gap-3">
            <Link
              href={`/${username}`}
              className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-80"
              style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", textDecoration: "none", boxShadow: "0 0 24px var(--blue-glow)" }}
            >
              내 명함 보기
            </Link>
            <Link
              href="/dashboard"
              className="px-7 py-3.5 rounded-full font-bold text-sm transition-opacity hover:opacity-70"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}
            >
              명함 수정
            </Link>
          </div>

          <p className="mt-4 text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            vibefolio.com/<span style={{ color: "var(--blue-bright)" }}>{username}</span>
          </p>
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

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
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

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-10">
            <Stat value={formatCount(userCount ?? 0)} label="바이브코더" />
            <div className="w-px h-8" style={{ background: "var(--border)" }} />
            <Stat value={formatCount(projectCount ?? 0)} label="업로드된 프로젝트" />
          </div>
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {tagline}
          </p>
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
