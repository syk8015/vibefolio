import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { getLocale } from "@/lib/i18n/server";
import { SECURITY_CONTACT } from "@/lib/securityContact";

// 바깥 사람이 보안 문제를 알려 주는 창구(2026-11-03, 보안 7단계). 결정(10-31): 무료 창구만 —
// /.well-known/security.txt + security@ 메일 + 이 페이지(시험 범위·선의 보호·사례금 없음·감사 명단). 유료 포상 없음.
// 약관처럼 문서 페이지라 한/영 본문을 통째로 분기한다(사전 키로 쪼개지 않음).
// 감사 명단에 이름을 올릴 때는 THANKS에 한 줄 더한다.

const THANKS: { name: string; when: string }[] = [];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Report a security issue | Nookframe" : "보안 문제 알리기 | Nookframe",
    alternates: { canonical: "https://nookframe.com/security" },
  };
}

const text = { color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: 15, lineHeight: 1.85 } as const;
const muted = { color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: 13, textDecoration: "none" } as const;
const mail = <a href={`mailto:${SECURITY_CONTACT}`} style={{ color: "var(--blue)" }}>{SECURITY_CONTACT}</a>;

export default async function SecurityPage() {
  const locale = await getLocale();
  const en = locale === "en";

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-6 md:px-12 py-4">
        <Logo />
        <LanguageToggle />
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
          {en ? "Report a security issue" : "보안 문제 알리기"}
        </h1>
        <p className="mb-12" style={{ ...muted }}>
          {en ? "Last updated: November 3, 2026" : "마지막 수정: 2026년 11월 3일"}
        </p>

        <div className="flex flex-col gap-10" style={text}>
          {en ? <EnBody /> : <KoBody />}
        </div>
      </div>

      <footer className="flex items-center justify-center gap-6 py-8">
        <Link href="/terms" style={muted}>{en ? "Terms of Service" : "이용약관"}</Link>
        <Link href="/privacy" style={muted}>{en ? "Privacy Policy" : "개인정보처리방침"}</Link>
        <span style={muted}>© {new Date().getFullYear()} Nookframe</span>
      </footer>
    </main>
  );
}

function KoBody() {
  return (
    <>
      <p>
        Nookframe에서 보안 문제를 찾았다면 {mail} 으로 알려 주세요. 받은 지 7일 안에 답장해요.
      </p>

      <Section title="알려 줄 때">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>문제가 있는 주소나 화면</li>
          <li>따라 하면 다시 일어나는 순서</li>
          <li>그걸로 누가 무엇을 할 수 있는지</li>
        </ul>
      </Section>

      <Section title="시험해도 되는 것">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>직접 만든 계정과 작품으로만 시험해 주세요. 공격하는 쪽과 당하는 쪽을 맡을 계정 두 개까지 만들어도 돼요.</li>
          <li>끝나면 만든 계정은 설정의 회원 탈퇴로 지워 주세요.</li>
        </ul>
      </Section>

      <Section title="하지 말아 주세요">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>다른 사람의 계정·작품·개인정보를 보거나 바꾸기. 우연히 봤다면 바로 멈추고, 저장하거나 퍼뜨리지 말고 알려 주세요.</li>
          <li>사이트를 느리게 하거나 멈추게 하는 대량 요청, 자동 도구로 마구 찌르기</li>
          <li>다른 사람에게 메일·메시지 보내기, 속여서 정보 얻기</li>
          <li>Nookframe가 쓰는 다른 회사(Vercel, Supabase, Cloudflare, E2B 등)를 직접 공격하기. 그곳은 그 회사의 규칙을 따라 주세요.</li>
          <li>고쳐지기 전에 내용을 공개하기. 고친 뒤 공개는 함께 정해요.</li>
        </ul>
      </Section>

      <Section title="약속할게요">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>이 규칙 안에서 좋은 뜻으로 한 시험에는 법적 조치를 하지 않아요. 실수로 선을 넘었더라도 바로 알려 주면 좋은 뜻으로 봐요.</li>
          <li>받은 신고는 어떻게 되고 있는지 알려 드리고, 고치면 바로 알려 드려요.</li>
        </ul>
      </Section>

      <Section title="사례금">
        개인이 운영하는 작은 서비스라 사례금은 없어요. 원하면 아래 감사 명단에 이름을 올려 드려요.
      </Section>

      <Section title="신고로 받지 않는 것">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>실제로 해를 끼치는 순서 없이, 보안 헤더나 메일 설정(SPF·DMARC)이 빠졌다는 것만 있는 경우</li>
          <li>자동 검사 도구의 결과만 붙인 경우</li>
          <li>로그아웃을 남이 대신 누르게 하는 것처럼 피해가 없는 경우</li>
        </ul>
      </Section>

      <Section title="감사 명단">
        {THANKS.length === 0
          ? "아직 없어요."
          : (
            <ul className="list-disc pl-5 flex flex-col gap-1">
              {THANKS.map((t) => <li key={t.name}>{t.name} · {t.when}</li>)}
            </ul>
          )}
      </Section>
    </>
  );
}

function EnBody() {
  return (
    <>
      <p>
        Found a security issue in Nookframe? Email {mail}. We reply within 7 days.
      </p>

      <Section title="What to include">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>The URL or screen where it happens</li>
          <li>Steps we can follow to reproduce it</li>
          <li>What an attacker could do with it</li>
        </ul>
      </Section>

      <Section title="What you can test">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Only accounts and works you created yourself. You may create up to two accounts to play attacker and victim.</li>
          <li>When you are done, delete those accounts from Settings → Delete account.</li>
        </ul>
      </Section>

      <Section title="Please don't">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>View or change anyone else&apos;s account, works, or personal data. If you see some by accident, stop, don&apos;t keep or share it, and tell us.</li>
          <li>Slow down or take down the site, or point automated scanners at it</li>
          <li>Email or message other people, or trick anyone into giving up information</li>
          <li>Attack the services we use (Vercel, Supabase, Cloudflare, E2B and others). Follow their own rules.</li>
          <li>Publish details before a fix. We&apos;ll agree on disclosure together after.</li>
        </ul>
      </Section>

      <Section title="Our promise">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>We won&apos;t take legal action over good-faith research that follows these rules. If you cross a line by mistake and tell us right away, we&apos;ll treat it as good faith.</li>
          <li>We&apos;ll keep you posted and tell you when it&apos;s fixed.</li>
        </ul>
      </Section>

      <Section title="Rewards">
        Nookframe is a small, one-person service, so there are no cash rewards. If you&apos;d like, we&apos;ll add your name to the thanks list below.
      </Section>

      <Section title="Out of scope">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Missing security headers or email settings (SPF, DMARC) without a working attack</li>
          <li>Raw output from automated scanners</li>
          <li>Issues with no real harm, like forcing someone to log out</li>
        </ul>
      </Section>

      <Section title="Thanks">
        {THANKS.length === 0
          ? "No one yet."
          : (
            <ul className="list-disc pl-5 flex flex-col gap-1">
              {THANKS.map((t) => <li key={t.name}>{t.name} · {t.when}</li>)}
            </ul>
          )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-black mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontSize: 17 }}>
        {title}
      </h2>
      <div>{children}</div>
    </div>
  );
}
