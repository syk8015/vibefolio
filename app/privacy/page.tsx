import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "개인정보처리방침 | Nookframe",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <nav className="flex items-center justify-between px-6 md:px-12 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <Logo />
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
          개인정보처리방침
        </h1>
        <p className="text-sm mb-12" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          시행일: 2025년 6월 1일
        </p>

        <div className="flex flex-col gap-10" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9rem", lineHeight: 1.9 }}>

          <p>
            Nookframe(이하 &quot;서비스&quot;)는 이용자의 개인정보를 중요하게 여기며, 「개인정보 보호법」 및 관련 법령을 준수합니다.
            본 방침은 서비스가 어떤 개인정보를 수집하고, 어떻게 활용하는지 안내합니다.
          </p>

          <Section title="제1조 (수집하는 개인정보 항목)">
            서비스는 회원가입 및 서비스 제공을 위해 다음과 같은 정보를 수집합니다.
            <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
              <li><strong>필수 항목:</strong> 이메일 주소, 사용자명(username), Google 계정 고유 식별자</li>
              <li><strong>선택 항목:</strong> 이름, 프로필 사진, 소개글(bio), GitHub/Twitter/기타 소셜 링크</li>
              <li><strong>자동 수집:</strong> 서비스 이용 기록, 접속 IP 주소, 쿠키 및 세션 정보</li>
            </ul>
          </Section>

          <Section title="제2조 (개인정보의 수집 및 이용 목적)">
            수집된 개인정보는 다음의 목적으로만 이용됩니다.
            <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
              <li>회원 식별 및 로그인 인증</li>
              <li>포트폴리오 페이지 생성 및 서비스 제공</li>
              <li>서비스 품질 개선 및 통계 분석</li>
              <li>서비스 관련 중요 공지 전달</li>
            </ul>
          </Section>

          <Section title="제3조 (개인정보의 보유 및 이용 기간)">
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>수집된 개인정보는 회원 탈퇴 시까지 보유하며, 탈퇴 즉시 파기합니다.</li>
              <li>단, 관련 법령에 따라 일정 기간 보존이 필요한 경우 해당 기간 동안 보관 후 파기합니다.</li>
            </ul>
          </Section>

          <Section title="제4조 (개인정보의 제3자 제공)">
            서비스는 이용자의 사전 동의 없이 개인정보를 외부에 제공하지 않습니다. 단, 다음의 경우는 예외로 합니다.
            <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
              <li>이용자가 사전에 동의한 경우</li>
              <li>법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            </ul>
          </Section>

          <Section title="제5조 (개인정보 처리 위탁)">
            서비스는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁합니다.
            <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
              <li><strong>Supabase Inc.</strong> — 데이터베이스 및 인증 서비스 (미국)</li>
              <li><strong>Vercel Inc.</strong> — 웹 서비스 호스팅 (미국)</li>
              <li><strong>Google LLC</strong> — OAuth 소셜 로그인 (미국)</li>
            </ul>
          </Section>

          <Section title="제6조 (이용자의 권리)">
            이용자는 언제든지 다음의 권리를 행사할 수 있습니다.
            <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
              <li>본인의 개인정보 열람, 수정, 삭제 요청</li>
              <li>개인정보 처리 정지 요청</li>
              <li>회원 탈퇴를 통한 개인정보 삭제</li>
            </ul>
            위 권리 행사는 아래 개인정보 보호책임자에게 이메일로 문의해 주세요.
          </Section>

          <Section title="제7조 (쿠키 사용)">
            서비스는 로그인 상태 유지를 위해 쿠키(Cookie)를 사용합니다. 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 로그인 등 일부 서비스 이용이 제한될 수 있습니다.
          </Section>

          <Section title="제8조 (개인정보 보호책임자)">
            개인정보 보호에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 아래 담당자에게 연락해 주세요.
            <div className="mt-3 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p><strong style={{ color: "var(--text-primary)" }}>개인정보 보호책임자:</strong> Nookframe 운영팀</p>
              <p><strong style={{ color: "var(--text-primary)" }}>이메일:</strong>{" "}
                <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--blue)" }}>vivestarter@gmail.com</a>
              </p>
              <p><strong style={{ color: "var(--text-primary)" }}>처리 기간:</strong> 문의 접수 후 영업일 기준 3일 이내</p>
            </div>
          </Section>

          <Section title="제9조 (개인정보처리방침의 변경)">
            이 방침은 법령 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지를 통해 안내합니다.
          </Section>

        </div>
      </div>

      <footer className="flex items-center justify-center gap-6 py-8" style={{ borderTop: "1px solid var(--border)" }}>
        <Link href="/terms" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>이용약관</Link>
        <Link href="/privacy" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", textDecoration: "none" }}>개인정보처리방침</Link>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem" }}>© {new Date().getFullYear()} Nookframe</span>
      </footer>
    </main>
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
