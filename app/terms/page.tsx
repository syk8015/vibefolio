import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { getLocale } from "@/lib/i18n/server";

// 법률 문서라 사전 키로 쪼개지 않고 한/영 본문을 통째로 분기한다.
// getLocale()을 읽는 순간 이 페이지는 동적 렌더링 — 법률 페이지라 트래픽·캐시 부담 없음.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Terms of Service | Nookframe" : "이용약관 | Nookframe",
  };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const en = locale === "en";

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-6 md:px-12 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <Logo />
        <LanguageToggle />
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
          {en ? "Terms of Service" : "이용약관"}
        </h1>
        <p className="text-sm mb-12" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          {en ? "Effective date: July 26, 2026" : "시행일: 2026년 7월 26일"}
        </p>

        <div className="flex flex-col gap-10" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9rem", lineHeight: 1.9 }}>
          {en ? <EnBody /> : <KoBody />}
        </div>
      </div>

      <footer className="flex items-center justify-center gap-6 py-8" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{en ? "Terms of Service" : "이용약관"}</Link>
        <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>{en ? "Privacy Policy" : "개인정보처리방침"}</Link>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Nookframe</span>
      </footer>
    </main>
  );
}

function KoBody() {
  return (
    <>
      <Section title="제1조 (목적)">
        이 약관은 Nookframe(이하 &quot;서비스&quot;)가 제공하는 포트폴리오 서비스의 이용 조건 및 절차, 이용자와 서비스 운영자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
      </Section>

      <Section title="제2조 (용어의 정의)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>&quot;서비스&quot;란 Nookframe가 제공하는 포트폴리오 생성·공유 플랫폼을 의미합니다.</li>
          <li>&quot;이용자&quot;란 이 약관에 동의하고 서비스를 이용하는 자를 의미합니다.</li>
          <li>&quot;콘텐츠&quot;란 이용자가 서비스에 등록한 프로젝트, 이미지, 링크, 텍스트 등 일체의 정보를 의미합니다.</li>
        </ul>
      </Section>

      <Section title="제3조 (약관의 효력 및 변경)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>이 약관은 서비스 화면에 게시하거나 기타 방법으로 이용자에게 공지함으로써 효력이 발생합니다.</li>
          <li>운영자는 필요한 경우 약관을 변경할 수 있으며, 변경된 약관은 공지 후 7일 이후부터 효력이 발생합니다.</li>
          <li>이용자는 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="제4조 (회원가입 및 계정)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>이용자는 Google 계정을 통한 소셜 로그인, 또는 이메일 주소와 비밀번호를 등록하는 방식으로 가입할 수 있습니다.</li>
          <li>서비스는 만 14세 이상만 가입할 수 있습니다. 만 14세 미만 아동은 서비스를 이용할 수 없습니다.</li>
          <li>이용자는 자신의 계정 정보를 안전하게 관리할 책임이 있으며, 계정 도용으로 인한 피해에 대해 운영자는 책임을 지지 않습니다.</li>
          <li>이용자는 타인의 정보를 이용하거나 허위 정보를 등록해서는 안 됩니다.</li>
        </ul>
      </Section>

      <Section title="제5조 (콘텐츠 및 저작권)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>이용자가 서비스에 등록한 콘텐츠의 저작권은 해당 이용자에게 귀속됩니다.</li>
          <li>이용자는 서비스 이용을 통해 다른 이용자의 저작권, 개인정보, 기타 권리를 침해해서는 안 됩니다.</li>
          <li>운영자는 이용자가 등록한 콘텐츠를 서비스 운영 및 홍보 목적으로 활용할 수 있습니다. 단, 이 경우 이용자의 동의를 구하거나 출처를 명시합니다.</li>
        </ul>
      </Section>

      <Section title="제6조 (금지 행위)">
        이용자는 다음 각 호의 행위를 해서는 안 됩니다.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>타인의 개인정보를 도용하거나 허위 정보를 등록하는 행위</li>
          <li>서비스의 정상적인 운영을 방해하는 행위</li>
          <li>음란물, 혐오 발언, 불법 콘텐츠를 등록하는 행위</li>
          <li>타인의 지식재산권을 침해하는 콘텐츠를 등록하는 행위</li>
          <li>상업적 스팸 또는 광고를 무단으로 게시하는 행위</li>
        </ul>
      </Section>

      <Section title="제7조 (서비스 변경 및 종료)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>운영자는 서비스의 내용을 변경하거나 종료할 수 있으며, 중요한 변경 사항은 사전에 공지합니다.</li>
          <li>운영자는 서비스 점검, 장애, 천재지변 등의 사유로 일시적으로 서비스를 중단할 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="제8조 (면책 조항)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>운영자는 이용자가 서비스에 등록한 콘텐츠의 정확성, 신뢰성에 대해 보증하지 않습니다.</li>
          <li>운영자는 이용자 간 또는 이용자와 제3자 사이에서 발생한 분쟁에 대해 개입할 의무가 없으며, 이로 인한 손해를 배상할 책임을 지지 않습니다.</li>
          <li>서비스는 현재 베타 버전으로 운영 중이며, 예고 없이 기능이 변경되거나 중단될 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="제9조 (준거법 및 관할법원)">
        이 약관은 대한민국 법률에 따라 해석되며, 서비스와 관련된 분쟁은 대한민국 법원을 관할 법원으로 합니다.
      </Section>

      <Section title="문의">
        이용약관에 관한 문의사항은 아래 이메일로 연락해 주세요.
        <br />
        <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--blue)" }}>vivestarter@gmail.com</a>
      </Section>
    </>
  );
}

function EnBody() {
  return (
    <>
      <Section title="Article 1 (Purpose)">
        These Terms set out the conditions and procedures for using the portfolio service provided by Nookframe
        (the &quot;Service&quot;), and the rights, obligations, and responsibilities of users and the Service operator.
      </Section>

      <Section title="Article 2 (Definitions)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>&quot;Service&quot; means the portfolio creation and sharing platform provided by Nookframe.</li>
          <li>&quot;User&quot; means anyone who agrees to these Terms and uses the Service.</li>
          <li>&quot;Content&quot; means any information a user registers on the Service, including projects, images, links, and text.</li>
        </ul>
      </Section>

      <Section title="Article 3 (Effect and Amendment of the Terms)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>These Terms take effect when posted on the Service or otherwise announced to users.</li>
          <li>The operator may amend these Terms when necessary. Amended Terms take effect 7 days after they are announced.</li>
          <li>If you do not agree to the amended Terms, you may stop using the Service and delete your account.</li>
        </ul>
      </Section>

      <Section title="Article 4 (Sign-up and Accounts)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>You may sign up with a Google account (social login) or by registering an email address and password.</li>
          <li>The Service is only available to users aged 14 or older. Children under 14 may not use the Service.</li>
          <li>You are responsible for keeping your account credentials secure. The operator is not liable for damage caused by unauthorized use of your account.</li>
          <li>You may not use another person&apos;s information or register false information.</li>
        </ul>
      </Section>

      <Section title="Article 5 (Content and Copyright)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Copyright in the content you register on the Service belongs to you.</li>
          <li>You may not use the Service to infringe other users&apos; copyrights, privacy, or other rights.</li>
          <li>The operator may use content you register for operating and promoting the Service. In such cases, the operator will seek your consent or credit the source.</li>
        </ul>
      </Section>

      <Section title="Article 6 (Prohibited Conduct)">
        You may not do any of the following.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>Impersonate others or register false information</li>
          <li>Interfere with the normal operation of the Service</li>
          <li>Register obscene material, hate speech, or illegal content</li>
          <li>Register content that infringes the intellectual property rights of others</li>
          <li>Post commercial spam or unauthorized advertising</li>
        </ul>
      </Section>

      <Section title="Article 7 (Changes to and Termination of the Service)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>The operator may change or terminate the Service, and will give advance notice of significant changes.</li>
          <li>The operator may temporarily suspend the Service for maintenance, outages, force majeure, or similar reasons.</li>
        </ul>
      </Section>

      <Section title="Article 8 (Disclaimer)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>The operator does not guarantee the accuracy or reliability of content registered by users.</li>
          <li>The operator has no obligation to intervene in disputes between users, or between users and third parties, and is not liable for damages arising from such disputes.</li>
          <li>The Service is currently in beta. Features may change or be discontinued without notice.</li>
        </ul>
      </Section>

      <Section title="Article 9 (Governing Law and Jurisdiction)">
        These Terms are interpreted under the laws of the Republic of Korea, and disputes related to the Service
        fall under the jurisdiction of the courts of the Republic of Korea.
      </Section>

      <Section title="Contact">
        For questions about these Terms, contact us at the email below.
        <br />
        <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--blue)" }}>vivestarter@gmail.com</a>
      </Section>

      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
        This English version is provided for convenience. If there is any inconsistency between the Korean and
        English versions, the Korean version prevails.
      </p>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-black text-base mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
        {title}
      </h2>
      <div>{children}</div>
    </div>
  );
}
