import Link from "next/link";
import type { Metadata } from "next";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { getLocale } from "@/lib/i18n/server";
import { MCP_TOOLS } from "@/lib/mcpTools";

// Claude 커넥터 공개 안내(2026-10-02) — 커넥터 디렉터리 등록 요건인 "공개 안내 문서"가 이 페이지다.
// 법률 페이지와 같은 틀(한/영 본문 통째 분기). 툴 이름·제목·읽기/쓰기 표시는 lib/mcpTools.ts
// (생성물)에서 읽어서, 툴이 바뀌면 이 페이지의 목록도 같이 바뀐다 — 설명 문장만 여기 있다.

const CONNECTOR_URL = "https://nookframe.com/api/mcp";
const SUPPORT_EMAIL = "vivestarter@gmail.com";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Claude connector | Nookframe" : "Claude 커넥터 | Nookframe",
    description:
      locale === "en"
        ? "Connect Claude to Nookframe and let it upload your vibe-coded work as a draft for you to review."
        : "Claude를 Nookframe에 연결하면, 바이브 코딩한 작품을 Claude가 초안으로 올려 줍니다.",
  };
}

// 툴별 한 줄 설명. 키가 lib/mcpTools.ts의 툴 이름과 어긋나면 타입 검사가 막는다.
type ToolName =
  | "publish_to_nookframe"
  | "check_nookframe_payload"
  | "rerecord_nookframe_demo"
  | "get_nookframe_status"
  | "list_nookframe_drafts"
  | "update_nookframe_draft"
  | "delete_nookframe_draft";

const TOOL_TEXT: Record<ToolName, { ko: string; en: string }> = {
  publish_to_nookframe: {
    ko: "작품을 초안으로 올립니다. 같은 주소로 다시 올리면 그 초안을 고칩니다. 공개는 하지 않습니다.",
    en: "Uploads a work as a draft. Uploading the same URL again updates that draft. It never makes anything public.",
  },
  check_nookframe_payload: {
    ko: "올리기 전에 모든 검사를 미리 돌려 봅니다. 아무것도 저장하지 않습니다.",
    en: "Runs every upload check in advance. Nothing is saved.",
  },
  rerecord_nookframe_demo: {
    ko: "공개된 작품의 새 촬영 대본을 대기 칸에 넣습니다. 다시 찍는 건 주인이 대시보드에서 누를 때입니다.",
    en: "Puts a new demo script for a published work in a waiting slot. Filming starts only when the owner approves it in the dashboard.",
  },
  get_nookframe_status: {
    ko: "작품이 초안인지 공개인지, 시연 영상이 찍혔는지 알려 줍니다.",
    en: "Tells you whether a work is a draft or public, and whether its demo video has been filmed.",
  },
  list_nookframe_drafts: {
    ko: "아직 공개하지 않은 내 초안 목록을 보여 줍니다.",
    en: "Lists your drafts that are not published yet.",
  },
  update_nookframe_draft: {
    ko: "초안의 제목·설명·촬영 대본 같은 정보를 고칩니다. 공개된 작품은 고칠 수 없습니다.",
    en: "Edits a draft's title, description, demo script and other details. Published works can't be edited.",
  },
  delete_nookframe_draft: {
    ko: "초안을 지웁니다(올린 파일 포함). 공개된 작품은 지울 수 없습니다.",
    en: "Deletes a draft, uploaded files included. Published works can't be deleted.",
  },
};

const TOOLS = MCP_TOOLS.map((tool) => ({
  name: tool.name,
  title: tool.title,
  readOnly: tool.annotations.readOnlyHint === true,
  text: TOOL_TEXT[tool.name as ToolName],
}));

export default async function ClaudeConnectorPage() {
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
          {en ? "Nookframe for Claude" : "Claude용 Nookframe 커넥터"}
        </h1>
        <p className="text-sm mb-12" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          {en ? "Last updated: October 2, 2026" : "마지막 수정: 2026년 10월 2일"}
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
      <Section title="무엇을 하나요">
        Nookframe은 바이브 코딩으로 만든 작품을 실제로 돌아가는 화면과 자동 촬영한 시연 영상으로 보여 주는
        포트폴리오입니다. 이 커넥터를 붙이면 Claude가 대화 중에 작품을 Nookframe에 <strong>초안으로</strong> 올려 줍니다.
        초안은 주인만 볼 수 있고, 주인이 대시보드에서 확인하고 [공개]를 눌러야 공개됩니다.
      </Section>

      <Section title="준비물">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Nookframe 계정(무료) — <Link href="/signup" style={{ color: "var(--blue)" }}>가입하기</Link></li>
          <li>커스텀 커넥터를 쓸 수 있는 Claude 계정. Team·Enterprise 요금제는 조직 관리자가 먼저 커넥터를 허용해야 할 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="연결하기">
        <ol className="list-decimal pl-5 flex flex-col gap-1">
          <li>Claude에서 설정 → 커넥터 → [커스텀 커넥터 추가]를 엽니다.</li>
          <li>주소 칸에 <Code>{CONNECTOR_URL}</Code>을 넣고 추가합니다.</li>
          <li>[연결]을 누르면 Nookframe 로그인과 허락 화면이 뜹니다. 로그인한 뒤 [허용]을 누릅니다.</li>
        </ol>
        <p className="mt-2">
          허락 화면에는 커넥터가 할 수 있는 일(초안 올리기, 그 초안 고치기·지우기)과 할 수 없는 일(공개하기, 공개된 작품 지우기)이 적혀 있습니다.
        </p>
      </Section>

      <Section title="써 보기">
        대화에서 이렇게 말하면 됩니다.
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>&ldquo;이 프로젝트를 Nookframe에 올려 줘&rdquo;</li>
          <li>&ldquo;내 Nookframe 시연 영상 다 찍혔어?&rdquo;</li>
          <li>&ldquo;Nookframe 초안 목록 보여 줘&rdquo;</li>
        </ul>
        <p className="mt-2">
          올리기 전에 Claude가 작품에 대해 짧게 세 가지를 묻습니다(가장 자랑하고 싶은 장면, 실제로 어떻게 쓰는지, 영상에 꼭 나와야 할 것).
          답은 주인의 말로 적어야 하고, 이 답에 맞춰 시연 영상이 찍힙니다. 공개하고 나면 촬영 로봇이 시연 영상을 찍는데,
          모아서 한꺼번에 찍기 때문에 몇 시간이 걸릴 수 있습니다.
        </p>
      </Section>

      <Section title="도구">
        읽기만 하는 도구는 Claude가 따로 묻지 않고 실행할 수 있습니다. 초안을 만들거나 바꾸거나 지우는 도구는 실행할 때마다 확인을 받습니다.
        <ToolList en={false} />
      </Section>

      <Section title="할 수 없는 것과 한도">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>작품을 공개하거나, 공개된 작품을 고치거나 지울 수 없습니다. 공개는 늘 주인이 직접 합니다.</li>
          <li>초안은 한 계정에 20개까지 둘 수 있습니다.</li>
          <li>배포 주소가 없는 한 파일짜리 작품은 HTML을 글자로 보낼 수 있습니다(2MB까지). 그보다 크거나 파일이 여러 개면 주인이 <Link href="/publish" style={{ color: "var(--blue)" }}>/publish</Link>에서 zip으로 붙입니다(25MB까지).</li>
          <li>커넥터는 사람 컴퓨터의 파일을 읽을 수 없습니다. 영상·스크린샷도 /publish에서 붙입니다.</li>
        </ul>
      </Section>

      <Section title="데이터와 개인정보">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>커넥터가 받는 것은 Claude가 도구를 부를 때 넘기는 내용뿐입니다: 작품 정보(제목·설명·촬영 대본), 주인 인터뷰 답, 작품 주소나 HTML. 대화 기록이나 Claude의 메모리는 읽지 않습니다.</li>
          <li>로그인 토큰은 서버에 해시로만 저장합니다. 접근 토큰은 12시간, 갱신 토큰은 90일이 지나면 끊깁니다.</li>
          <li>연결은 언제든 끊을 수 있습니다: Nookframe 설정 → AI 연결 → [끊기]. 끊는 즉시 그 연결로는 아무것도 올릴 수 없습니다.</li>
          <li>나머지는 <Link href="/privacy" style={{ color: "var(--blue)" }}>개인정보처리방침</Link>을 따릅니다.</li>
        </ul>
      </Section>

      <Section title="문제가 생기면">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>올리기가 거절되면 이유가 함께 옵니다. Claude가 이유를 읽고 고쳐서 다시 올립니다.</li>
          <li>연결이 안 되면 커넥터를 지웠다가 다시 추가해 보세요. 그래도 안 되면 아래로 알려 주세요.</li>
        </ul>
      </Section>

      <Section title="문의">
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--blue)" }}>{SUPPORT_EMAIL}</a>
      </Section>
    </>
  );
}

function EnBody() {
  return (
    <>
      <Section title="What it does">
        Nookframe is a portfolio for vibe-coded work: each work is shown as a live, running app plus a demo video that
        is filmed automatically. With this connector, Claude can upload your work to Nookframe <strong>as a draft</strong>{" "}
        right from the conversation. Only you can see a draft; nothing becomes public until you review it in your
        dashboard and press Publish.
      </Section>

      <Section title="What you need">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>A Nookframe account (free) — <Link href="/signup" style={{ color: "var(--blue)" }}>sign up</Link></li>
          <li>A Claude account that can add custom connectors. On Team and Enterprise plans, an organization owner may need to allow the connector first.</li>
        </ul>
      </Section>

      <Section title="Connect">
        <ol className="list-decimal pl-5 flex flex-col gap-1">
          <li>In Claude, open Settings → Connectors → Add custom connector.</li>
          <li>Enter <Code>{CONNECTOR_URL}</Code> as the URL and add it.</li>
          <li>Press Connect. Nookframe&apos;s sign-in and consent screen opens — sign in, then press Allow.</li>
        </ol>
        <p className="mt-2">
          The consent screen lists what the connector can do (upload drafts, edit or delete the drafts it uploaded) and
          what it can&apos;t (publish anything, delete public works).
        </p>
      </Section>

      <Section title="Try it">
        Ask Claude things like:
        <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
          <li>&ldquo;Publish this project to Nookframe&rdquo;</li>
          <li>&ldquo;Is my Nookframe demo video filmed yet?&rdquo;</li>
          <li>&ldquo;Show my Nookframe drafts&rdquo;</li>
        </ul>
        <p className="mt-2">
          Before uploading, Claude asks you three short questions about the work (the moment you&apos;re proudest of, how
          you actually use it, and what the video must show). The answers have to be in your own words, and the demo
          video is filmed around them. After you publish, a filming robot records the demo. Filming runs in batches, so
          it can take a few hours.
        </p>
      </Section>

      <Section title="Tools">
        Claude can run read-only tools without asking. Tools that create, change, or delete a draft ask for your
        confirmation every time.
        <ToolList en />
      </Section>

      <Section title="Limits">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>The connector can&apos;t publish a work, or edit or delete a public one. Publishing is always done by you.</li>
          <li>You can keep up to 20 drafts.</li>
          <li>A single-file work with no deployed URL can be sent as HTML text (up to 2MB). Anything bigger, or with several files, is attached as a zip at <Link href="/publish" style={{ color: "var(--blue)" }}>/publish</Link> (up to 25MB).</li>
          <li>The connector can&apos;t read files on your computer. Videos and screenshots are attached at /publish too.</li>
        </ul>
      </Section>

      <Section title="Data and privacy">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>The connector only receives what Claude passes when it calls a tool: the work&apos;s details (title, description, demo script), your interview answers, and the work&apos;s URL or HTML. It does not read your chat history or Claude&apos;s memory.</li>
          <li>Sign-in tokens are stored only as hashes. Access tokens expire after 12 hours, refresh tokens after 90 days.</li>
          <li>You can disconnect at any time: Nookframe Settings → AI connections → Disconnect. The connection stops working immediately.</li>
          <li>Everything else follows our <Link href="/privacy" style={{ color: "var(--blue)" }}>Privacy Policy</Link>.</li>
        </ul>
      </Section>

      <Section title="Troubleshooting">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>If an upload is rejected, the reason comes back with it. Claude reads it, fixes the upload, and tries again.</li>
          <li>If connecting fails, remove the connector and add it again. If it still fails, email us below.</li>
        </ul>
      </Section>

      <Section title="Support">
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--blue)" }}>{SUPPORT_EMAIL}</a>
      </Section>
    </>
  );
}

function ToolList({ en }: { en: boolean }) {
  return (
    <ul className="flex flex-col gap-3 mt-4">
      {TOOLS.map((tool) => (
        <li key={tool.name} className="pl-4" style={{ borderLeft: "2px solid var(--border)" }}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <strong style={{ color: "var(--text-primary)" }}>{tool.title}</strong>
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
              {tool.readOnly ? (en ? "read-only" : "읽기만") : (en ? "asks first" : "매번 확인")}
            </span>
          </div>
          <Code>{tool.name}</Code>
          <div>{en ? tool.text.en : tool.text.ko}</div>
        </li>
      ))}
    </ul>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ fontSize: "0.8rem", wordBreak: "break-all", color: "var(--text-primary)" }}>{children}</code>
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
