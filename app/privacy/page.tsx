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
    title: locale === "en" ? "Privacy Policy | Nookframe" : "개인정보처리방침 | Nookframe",
  };
}

export default async function PrivacyPage() {
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
          {en ? "Privacy Policy" : "개인정보처리방침"}
        </h1>
        <p className="text-sm mb-12" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          {en ? "Effective date: September 22, 2026 (previous version: September 1, 2026)" : "시행일: 2026년 9월 22일 (이전 판: 2026년 9월 1일)"}
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

// 처리 위탁·국외 이전 업체. 한/영 본문이 같이 읽는다. contact는 각 업체의 공개 개인정보 안내 주소
// (thum.io는 별도 방침 페이지가 없어 홈페이지).
const PROCESSORS = [
  {
    name: "Supabase Inc.",
    contact: "https://supabase.com/privacy",
    ko: { task: "데이터베이스·인증·파일 저장", items: "제1조의 회원 정보 전부, 업로드한 작품 파일, 서비스 이용 기록" },
    en: { task: "database, authentication, and file storage", items: "all account information in Article 1, uploaded project files, service usage records" },
  },
  {
    name: "Vercel Inc.",
    contact: "https://vercel.com/legal/privacy-policy",
    ko: { task: "웹 서비스 호스팅", items: "접속 IP 주소, 접속 국가, 브라우저 종류, 요청 기록" },
    en: { task: "web hosting", items: "IP address, country of access, browser type, request logs" },
  },
  {
    name: "Google LLC",
    contact: "https://policies.google.com/privacy",
    ko: { task: "OAuth 소셜 로그인", items: "Google 로그인을 선택한 경우 Google 계정 고유 식별자, 이메일 주소, 이름, 프로필 사진" },
    en: { task: "OAuth social login", items: "if you choose Google login: Google account identifier, email address, name, profile photo" },
  },
  {
    name: "Cloudflare, Inc.",
    contact: "https://www.cloudflare.com/privacypolicy/",
    ko: { task: "데모 영상 저장(R2) 및 봇 차단(Turnstile)", items: "촬영본과 업로드한 영상, 봇 확인 시 접속 IP 주소와 브라우저 정보" },
    en: { task: "demo video storage (R2) and bot protection (Turnstile)", items: "recordings and uploaded videos; IP address and browser information during bot checks" },
  },
  {
    name: "Resend, Inc.",
    contact: "https://resend.com/legal/privacy-policy",
    ko: { task: "인증·안내 이메일 발송", items: "이메일 주소, 사용자명, 보내는 메일의 내용" },
    en: { task: "authentication and notification emails", items: "email address, username, the content of the email being sent" },
  },
  {
    name: "Anthropic PBC",
    contact: "https://www.anthropic.com/legal/privacy",
    ko: { task: "자동 시연 촬영 시 화면 분석 및 콘텐츠 검토", items: "촬영 중 작품 화면 이미지와 촬영본의 일부 프레임, 작품 정보(제목·설명·시연 안내 문구)" },
    en: { task: "screen analysis and content review during automated demo recording", items: "screen images captured during recording and some frames of the film, project information (title, description, demo instructions)" },
  },
  {
    name: "E2B, Inc.",
    contact: "https://e2b.dev/privacy",
    ko: { task: "자동 시연을 위한 업로드 코드의 격리 실행 샌드박스", items: "업로드한 작품 파일(코드)" },
    en: { task: "isolated sandbox that runs uploaded code for the automated demo", items: "uploaded project files (code)" },
  },
  {
    name: "thum.io",
    contact: "https://www.thum.io",
    ko: { task: "공개된 작품 페이지의 미리보기 이미지 생성", items: "공개된 작품의 주소" },
    en: { task: "preview image generation for published project pages", items: "the address of the published work" },
  },
  {
    name: "Functional Software, Inc. (Sentry)",
    contact: "https://sentry.io/privacy/",
    ko: { task: "오류 모니터링", items: "오류가 났을 때의 기술 정보(오류 내용, 브라우저 종류, 접속 IP 주소, 방문한 페이지 주소)" },
    en: { task: "error monitoring", items: "technical details when an error occurs (error content, browser type, IP address, page address)" },
  },
];

function KoBody() {
  return (
    <>
      <p>
        Nookframe(이하 &quot;서비스&quot;)는 이용자의 개인정보를 중요하게 여기며, 「개인정보 보호법」 및 관련 법령을 준수합니다.
        본 방침은 서비스가 어떤 개인정보를 수집하고, 어떻게 활용하는지 안내합니다.
      </p>

      <Section title="제1조 (수집하는 개인정보 항목)">
        서비스는 회원가입 및 서비스 제공을 위해 다음과 같은 정보를 수집합니다.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li><strong>필수 항목:</strong> 이메일 주소, 사용자명(username), 그리고 가입 방식에 따라 Google 계정 고유 식별자(소셜 로그인) 또는 비밀번호(이메일 가입 — 단방향 암호화하여 저장)</li>
          <li><strong>선택 항목:</strong> 이름, 프로필 사진, 소개글(bio), GitHub/Twitter/기타 소셜 링크</li>
          <li><strong>자동 수집:</strong> 서비스 이용 기록(페이지 조회·기능 사용), 접속 IP 주소, 접속 국가, 브라우저 종류(User-Agent), 유입 경로(리퍼러·UTM 값), 쿠키 및 세션 정보, 브라우저 로컬 저장소에 저장되는 익명 식별자</li>
        </ul>
        <p className="mt-3">
          서비스는 만 14세 이상만 가입할 수 있으며, 만 14세 미만 아동의 개인정보는 수집하지 않습니다.
        </p>
        <p className="mt-3">
          이용자가 업로드한 작품 파일은 개인정보 수집 항목이 아니지만, <strong>공개 주소로 제공되어 주소를 아는
          사람이 내려받을 수 있습니다</strong>. 파일 안에 본인이나 타인의 개인정보를 담지 말아 주세요. 자세한 내용은{" "}
          <Link href="/terms" style={{ color: "var(--blue)" }}>이용약관 제6조</Link>에 있습니다.
        </p>
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
          <li>수집된 개인정보와 이용자가 업로드한 파일은 <strong>계정이 유지되는 동안</strong> 보관하며, 별도의 만료 기간을 두지 않습니다.</li>
          <li>회원 탈퇴 시 즉시 파기합니다. 저장소의 작품 파일·프로필 사진·촬영본까지 함께 삭제한 뒤 계정을 삭제합니다.</li>
          <li>개별 프로젝트를 삭제하면 그 프로젝트의 파일과 촬영본도 함께 삭제됩니다.</li>
          <li>단, 서비스 이용 통계(조회수·기능 사용 기록 등)는 개인을 알아볼 수 없도록 계정 식별자를 제거한 형태로 전환하여 보관합니다. 이 기록만으로는 특정 개인을 식별할 수 없습니다.</li>
          <li>단, 관련 법령에 따라 일정 기간 보존이 필요한 경우 해당 기간 동안 보관 후 파기합니다.</li>
          <li><strong>파기 방법:</strong> 전자적 파일 형태의 정보는 복구할 수 없는 방법으로 영구 삭제하며, 종이 문서로는 개인정보를 보관하지 않습니다.</li>
        </ul>
      </Section>

      <Section title="제4조 (개인정보의 제3자 제공)">
        서비스는 이용자의 사전 동의 없이 개인정보를 외부에 제공하지 않습니다. 단, 다음의 경우는 예외로 합니다.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>이용자가 사전에 동의한 경우</li>
          <li>법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
        </ul>
      </Section>

      {/* 2026-09-22: 처리 위탁 목록이 사실상 국외 이전인데 「개인정보 보호법」 제28조의8이
          요구하는 이전 항목·시기와 방법·보유기간·거부 방법이 빠져 있었다(r2-legal 점검).
          업체 목록은 PROCESSORS 하나로 한/영이 같이 쓴다 — 한쪽만 고쳐 갈라지지 않게. */}
      <Section title="제5조 (개인정보 처리 위탁 및 국외 이전)">
        서비스는 원활한 서비스 제공을 위해 아래 업체에 개인정보 처리 업무를 위탁하며, 이 업체들은 모두 국외(미국)에 있어
        개인정보가 국외로 이전됩니다.
        <ul className="list-disc pl-5 flex flex-col gap-3 mt-2">
          {PROCESSORS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.ko.task} (미국)
              <br />
              이전 항목: {p.ko.items}
              <br />
              연락처: <a href={p.contact} style={{ color: "var(--blue)" }}>{p.contact.replace(/^https?:\/\//, "")}</a>
            </li>
          ))}
        </ul>
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-4">
          <li><strong>이전 시기와 방법:</strong> 서비스를 이용하는 시점에, 암호화된 네트워크(HTTPS 등)를 통해 수시로 전송합니다.</li>
          <li><strong>이전받는 자의 이용 목적과 보유 기간:</strong> 위에 적은 위탁 업무를 수행하는 목적으로만 이용하며, 회원 탈퇴 또는 위탁 계약 종료 시까지 보유합니다. 탈퇴하면 제3조에 따라 함께 삭제됩니다.</li>
          <li><strong>이전을 거부하는 방법과 효과:</strong> 개인정보 보호책임자(제9조)에게 이메일로 거부 의사를 알리거나 회원 탈퇴를 하시면 이전이 중단됩니다. 다만 위 업체들은 서비스 운영에 꼭 필요하므로, 거부하시면 회원가입과 서비스 이용이 불가능합니다.</li>
        </ul>
      </Section>

      <Section title="제6조 (이용자의 권리)">
        이용자는 언제든지 다음의 권리를 행사할 수 있습니다.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>본인의 개인정보 열람, 수정, 삭제 요청</li>
          <li>개인정보 처리 정지 요청</li>
          <li>회원 탈퇴를 통한 개인정보 삭제</li>
        </ul>
        열람·수정·삭제는 대부분 직접 하실 수 있습니다. 대시보드에서 프로필과 작품을 수정·삭제할 수 있고,
        대시보드 &quot;명함&quot; 탭 아래 <strong>회원 탈퇴</strong>를 누르면 저장소의 작품 파일·프로필 사진·촬영본까지
        함께 지운 뒤 계정이 삭제됩니다. 직접 처리하기 어렵거나 그 밖의 요청은 아래 개인정보 보호책임자에게
        이메일로 문의해 주세요.
      </Section>

      <Section title="제7조 (쿠키 및 로컬 저장소 사용)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>쿠키:</strong> 로그인 상태 유지와 언어 설정 기억을 위해 쿠키(Cookie)를 사용합니다.</li>
          <li><strong>로컬 저장소:</strong> 방문 통계를 위해 브라우저 로컬 저장소(localStorage)에 무작위로 만든 익명 식별자와 처음 방문했을 때의 유입 경로(리퍼러·UTM 값)를 저장합니다. 이 값만으로는 이용자가 누구인지 알 수 없습니다.</li>
          <li>브라우저 설정에서 쿠키와 사이트 데이터 저장을 거부하거나 지울 수 있습니다. 다만 쿠키를 거부하면 로그인 등 일부 서비스 이용이 제한될 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="제8조 (개인정보의 안전성 확보 조치)">
        서비스는 개인정보를 안전하게 지키기 위해 다음과 같은 조치를 하고 있습니다.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li><strong>암호화:</strong> 비밀번호는 단방향 암호화하여 저장하며, 서비스와 주고받는 모든 데이터는 암호화된 연결(HTTPS)로 전송합니다.</li>
          <li><strong>접근 통제:</strong> 데이터베이스는 이용자가 본인의 정보에만 접근할 수 있도록 행 단위 접근 권한으로 막아 두었으며, 관리 권한은 최소 인원에게만 부여합니다.</li>
          <li><strong>비밀 정보 관리:</strong> 서버의 접속 키와 비밀값은 코드와 분리된 환경변수로 관리하며, 외부에 노출하지 않습니다.</li>
          <li><strong>기록 보관과 점검:</strong> 오류와 비정상 접근을 모니터링하고, 문제가 생기면 확인할 수 있도록 서버 기록을 보관합니다.</li>
        </ul>
      </Section>

      <Section title="제9조 (개인정보 보호책임자)">
        개인정보 보호에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 아래 담당자에게 연락해 주세요.
        <div className="mt-3 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p><strong style={{ color: "var(--text-primary)" }}>개인정보 보호책임자:</strong> Nookframe 운영팀</p>
          <p><strong style={{ color: "var(--text-primary)" }}>이메일:</strong>{" "}
            <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--blue)" }}>vivestarter@gmail.com</a>
          </p>
          <p><strong style={{ color: "var(--text-primary)" }}>처리 기간:</strong> 문의 접수 후 영업일 기준 3일 이내</p>
        </div>
      </Section>

      <Section title="제10조 (권익침해 구제 방법)">
        개인정보 침해로 인한 구제를 받기 위해 아래 기관에 분쟁 해결이나 상담을 신청할 수 있습니다.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>개인정보 분쟁조정위원회: (국번 없이) 1833-6972 (<a href="https://www.kopico.go.kr" style={{ color: "var(--blue)" }}>www.kopico.go.kr</a>)</li>
          <li>개인정보침해 신고센터: (국번 없이) 118 (<a href="https://privacy.kisa.or.kr" style={{ color: "var(--blue)" }}>privacy.kisa.or.kr</a>)</li>
          <li>대검찰청: (국번 없이) 1301 (<a href="https://www.spo.go.kr" style={{ color: "var(--blue)" }}>www.spo.go.kr</a>)</li>
          <li>경찰청: (국번 없이) 182 (<a href="https://ecrm.police.go.kr" style={{ color: "var(--blue)" }}>ecrm.police.go.kr</a>)</li>
        </ul>
      </Section>

      <Section title="제11조 (개인정보처리방침의 변경)">
        이 방침은 법령 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지를 통해 안내합니다.
      </Section>
    </>
  );
}

function EnBody() {
  return (
    <>
      <p>
        Nookframe (the &quot;Service&quot;) takes your privacy seriously and complies with applicable privacy laws,
        including the Personal Information Protection Act of the Republic of Korea. This policy explains what
        personal information the Service collects and how it is used.
      </p>

      <Section title="Article 1 (Information We Collect)">
        The Service collects the following information for sign-up and service delivery.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li><strong>Required:</strong> email address, username, and — depending on how you sign up — your Google account identifier (social login) or a password (email sign-up; stored with one-way encryption)</li>
          <li><strong>Optional:</strong> name, profile photo, bio, GitHub/Twitter/other social links</li>
          <li><strong>Collected automatically:</strong> service usage records (page views, feature usage), IP address, country of access, browser type (User-Agent), referral source (referrer and UTM values), cookies and session data, and an anonymous identifier kept in your browser&apos;s local storage</li>
        </ul>
        <p className="mt-3">
          The Service is only available to users aged 14 or older. We do not collect personal information from
          children under 14.
        </p>
        <p className="mt-3">
          The project files you upload are not collected as personal information, but they are <strong>served from
          public addresses and can be downloaded by anyone who knows the address</strong>. Please do not put your own
          or anyone else&apos;s personal information inside them. See{" "}
          <Link href="/terms" style={{ color: "var(--blue)" }}>Article 6 of the Terms</Link> for details.
        </p>
      </Section>

      <Section title="Article 2 (Purpose of Collection and Use)">
        Collected personal information is used only for the following purposes.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>Identifying members and authenticating logins</li>
          <li>Creating your portfolio page and providing the Service</li>
          <li>Improving service quality and analyzing usage statistics</li>
          <li>Delivering important notices about the Service</li>
        </ul>
      </Section>

      <Section title="Article 3 (Retention and Use Period)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Personal information and the files you upload are kept <strong>for as long as your account exists</strong>; there is no separate expiry period.</li>
          <li>When you delete your account, everything is destroyed immediately: stored project files, profile photo, and recordings are deleted first, then the account itself.</li>
          <li>Deleting an individual project also deletes that project&apos;s files and recordings.</li>
          <li>However, service usage statistics (view counts, feature usage records, etc.) are converted into a de-identified form with account identifiers removed, and retained in that form. These records alone cannot identify any individual.</li>
          <li>Where retention is required by applicable law, the information is kept for the legally required period and then destroyed.</li>
          <li><strong>How it is destroyed:</strong> information in electronic form is permanently deleted in a way that cannot be recovered. We do not keep personal information on paper.</li>
        </ul>
      </Section>

      <Section title="Article 4 (Disclosure to Third Parties)">
        The Service does not provide personal information to outside parties without your prior consent, except in
        the following cases.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>When you have given prior consent</li>
          <li>When required by law, or when requested by an investigative agency following the procedures and methods prescribed by law</li>
        </ul>
      </Section>

      <Section title="Article 5 (Outsourcing and International Transfer)">
        The Service entrusts the following processors with data processing tasks to operate the Service. All of them
        are located outside Korea (in the US), so your personal information is transferred abroad.
        <ul className="list-disc pl-5 flex flex-col gap-3 mt-2">
          {PROCESSORS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.en.task} (US)
              <br />
              Data transferred: {p.en.items}
              <br />
              Contact: <a href={p.contact} style={{ color: "var(--blue)" }}>{p.contact.replace(/^https?:\/\//, "")}</a>
            </li>
          ))}
        </ul>
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-4">
          <li><strong>When and how:</strong> transferred as you use the Service, over encrypted connections (HTTPS or similar).</li>
          <li><strong>Purpose and retention by the recipient:</strong> used only to perform the tasks listed above, and kept until you delete your account or the processing contract ends. Deleting your account removes it as described in Article 3.</li>
          <li><strong>How to refuse, and what happens:</strong> email the privacy officer (Article 9) or delete your account to stop the transfer. Because these processors are essential to running the Service, refusing means you cannot sign up for or use the Service.</li>
        </ul>
      </Section>

      <Section title="Article 6 (Your Rights)">
        You may exercise the following rights at any time.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>Request access to, correction of, or deletion of your personal information</li>
          <li>Request suspension of processing of your personal information</li>
          <li>Delete your personal information by deleting your account</li>
        </ul>
        You can do most of this yourself: edit or delete your profile and works from the dashboard, and use
        <strong>Delete account</strong> at the bottom of the dashboard&apos;s &quot;Card&quot; tab — it removes your
        stored project files, profile photo, and recordings first, then the account. For anything you cannot do
        yourself, email the privacy officer listed below.
      </Section>

      <Section title="Article 7 (Cookies and Local Storage)">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><strong>Cookies:</strong> used to keep you signed in and to remember your language setting.</li>
          <li><strong>Local storage:</strong> for visit statistics, a randomly generated anonymous identifier and the referral source of your first visit (referrer and UTM values) are stored in your browser&apos;s local storage. These values alone cannot identify you.</li>
          <li>You can refuse or clear cookies and site data in your browser settings. If you refuse cookies, some features, such as staying logged in, may not work properly.</li>
        </ul>
      </Section>

      <Section title="Article 8 (Security Measures)">
        The Service takes the following measures to keep personal information safe.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li><strong>Encryption:</strong> passwords are stored with one-way encryption, and all data exchanged with the Service travels over encrypted connections (HTTPS).</li>
          <li><strong>Access control:</strong> the database uses row-level access rules so that each user can reach only their own data, and administrative access is limited to the minimum number of people.</li>
          <li><strong>Secret management:</strong> server access keys and secrets are kept in environment variables separate from the code and are never exposed.</li>
          <li><strong>Logging and monitoring:</strong> errors and abnormal access are monitored, and server logs are kept so that problems can be investigated.</li>
        </ul>
      </Section>

      <Section title="Article 9 (Privacy Officer)">
        For questions, complaints, or remedies regarding privacy, contact the officer below.
        <div className="mt-3 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p><strong style={{ color: "var(--text-primary)" }}>Privacy officer:</strong> Nookframe Operations Team</p>
          <p><strong style={{ color: "var(--text-primary)" }}>Email:</strong>{" "}
            <a href="mailto:vivestarter@gmail.com" style={{ color: "var(--blue)" }}>vivestarter@gmail.com</a>
          </p>
          <p><strong style={{ color: "var(--text-primary)" }}>Response time:</strong> within 3 business days of receiving your inquiry</p>
        </div>
      </Section>

      <Section title="Article 10 (Remedies for Privacy Infringement)">
        To seek remedies for a privacy infringement, you may apply for dispute resolution or counseling with the
        following Korean agencies.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>Personal Information Dispute Mediation Committee: 1833-6972 (<a href="https://www.kopico.go.kr" style={{ color: "var(--blue)" }}>www.kopico.go.kr</a>)</li>
          <li>Personal Information Infringement Report Center: 118 (<a href="https://privacy.kisa.or.kr" style={{ color: "var(--blue)" }}>privacy.kisa.or.kr</a>)</li>
          <li>Supreme Prosecutors&apos; Office: 1301 (<a href="https://www.spo.go.kr" style={{ color: "var(--blue)" }}>www.spo.go.kr</a>)</li>
          <li>Korean National Police Agency: 182 (<a href="https://ecrm.police.go.kr" style={{ color: "var(--blue)" }}>ecrm.police.go.kr</a>)</li>
        </ul>
      </Section>

      <Section title="Article 11 (Changes to This Policy)">
        This policy may be revised to reflect changes in law or in the Service. Changes will be announced through
        the Service.
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
