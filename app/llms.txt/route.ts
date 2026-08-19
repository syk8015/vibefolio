import { createPublicClient, throwIfReadFailed } from "@/lib/supabase/public";

// llms.txt — AI(ChatGPT·Claude·Perplexity 등)가 이 사이트를 설명할 때 읽는 요약본.
// 검색엔진용 sitemap.xml의 LLM 판이라고 보면 된다. 구글 순위와는 무관하다.
//
// 사람이 읽을 문서가 아니므로 마크다운 그대로 text/plain으로 내보낸다
// (llmstxt.org 관례: H1 하나 → 인용문 한 줄 요약 → 섹션별 링크 목록).
//
// 한국어가 본문이고 영어 요약을 한 단락 얹었다. 서비스는 한국어 우선이지만
// 질문은 어느 언어로든 들어오기 때문.

const SITE = "https://nookframe.com";

// 크롤러가 부를 때마다 DB를 때리지 않게 1시간 캐시. 쿠키를 안 읽는
// 공개 클라이언트라 정적 캐시가 그대로 먹는다.
export const revalidate = 3600;

const HEAD = `# Nookframe

> AI로 무언가 만드는 사람을 위한 라이브 포트폴리오. 만든 것을 링크 하나로 보여주고,
> 방문자는 멈춘 스크린샷이 아니라 실제로 도는 화면을 만난다.

Nookframe is a live portfolio for people who build things with AI ("vibe coders").
Each person gets one page — ${SITE}/{username} — where the work leads instead of the
profile. Uploaded builds run live inside the page; projects that live at a deployed URL
get an auto-recorded demo video plus a one-tap door to the real site. The product is
Korean-first with an English UI toggle.

깃허브는 코드의 집, 노션은 한 페이지, 링크트리는 링크 묶음 — Nookframe은 한 사람의
작품 집이다. 완성작만 올리는 곳이 아니라 주말에 만들다 만 것, 시험용, 데모도 전부 올린다.

## 어떻게 동작하나

- 프레임: 사람 한 명당 페이지 하나(${SITE}/{username}). 소개보다 작품이 먼저 온다.
- 올린 파일은 페이지 안에서 실행: 정적 빌드를 통째로 올리면 방문자가 그 자리에서 직접 만져본다.
- 배포된 URL은 시연 영상 + 새 탭: 남의 사이트는 임베드를 막는 경우가 많아, 움직이는 화면은
  자동 시연 영상이 맡고 실물은 새 탭에서 연다.
- 자동 시연 영상: 작품에 따라 시스템이 앱을 실제로 조작하며 녹화한 시연 영상이 붙는다.
- 작품별 주소: 작품마다 전용 페이지(${SITE}/{username}/{project-id})가 있고,
  메신저에 붙여넣으면 시연 영상이 바로 재생된다.

## 자주 묻는 것

- 깃허브 링크면 충분하지 않나요? — 깃허브는 코드를, 여기는 작품을.
- 무엇을 올려야 하나요? — 주말의 스케치부터 배포한 url까지.
- 완성된 것을 올려야 하나요? — 당신의 미완성도, 누군가에게 완성.
- 누가 쓰는 건가요? — @everyone.

## 주요 링크

- [홈](${SITE}): 서비스 소개와 실제 프레임 미리보기
- [시작하기](${SITE}/signup): 무료 가입
- [이용약관](${SITE}/terms)
- [개인정보처리방침](${SITE}/privacy)
- [사이트맵](${SITE}/sitemap.xml): 공개된 전체 페이지 목록
`;

const TAIL = `
## 문의

- 이메일: vivestarter@gmail.com
`;

// 실제로 어떻게 쓰이는지 보여주는 표본. 목록이 비대해지지 않게 상한을 둔다.
const SAMPLE_LIMIT = 20;

// 유저가 이만큼은 있어야 목록을 내보낸다. 초기의 테스트·운영자 계정 몇 개가
// "이 서비스 쓰는 사람들"로 읽히면 표본이 없느니만 못하다. SAMPLE_LIMIT보다
// 작으므로 한 번 읽은 행 수만으로 판정된다 — 별도 count 질의가 필요 없다.
const SAMPLE_MIN = 5;

async function sampleFrames(): Promise<string> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("username, name")
      .order("updated_at", { ascending: false })
      .limit(SAMPLE_LIMIT);
    throwIfReadFailed(error, "llms:profiles");

    const rows = (data ?? []).filter((p) => Boolean(p.username));
    if (rows.length < SAMPLE_MIN) return "";

    const lines = rows
      .map((p) => {
        const label = (p.name as string | null) || (p.username as string);
        return `- [${label}](${SITE}/${p.username})`;
      })
      .join("\n");
    return `\n## 실제 프레임\n\n${lines}\n`;
  } catch {
    // 표본은 있으면 좋은 것일 뿐 — DB가 죽어도 설명 본문은 나가야 한다.
    return "";
  }
}

export async function GET() {
  const body = HEAD + (await sampleFrames()) + TAIL;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
