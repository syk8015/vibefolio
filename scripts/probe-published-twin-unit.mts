// 이미 공개된 같은 작품 판정(NF-19) — lib/publishedTwin.ts. 네트워크 없음.
// 사용: `npx -y tsx scripts/probe-published-twin-unit.mts`
//
// 무엇을 보나: (1) 같은 외부 주소면 쌍둥이(끝 슬래시·#·호스트 대소문자 무시, 쿼리는 다름)
// (2) 파일 업로드 주소(/api/preview/…)는 주소로 안 엮는다 (3) 제목은 대소문자·공백·전각만
// 무시하고 두 언어 판 아무거나 맞으면 쌍둥이 (4) 자기 자신은 빼고, 주소가 제목보다 먼저.
import { findPublishedTwin, twinUrlKey, twinTitleKey, translationTitles } from "../lib/publishedTwin";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const pub = [
  { id: "p1", title: "스킨로그", demoUrl: "https://skinlog.vercel.app/", otherTitles: ["SkinLog"] },
  { id: "p2", title: "온습도계", demoUrl: "/api/preview/u/p2/index.html", otherTitles: ["Home Climate Monitor"] },
];

// ── (1) 주소 ──
ok("같은 주소 = url", findPublishedTwin({ title: "새 이름", demoUrl: "https://skinlog.vercel.app" }, pub)?.by === "url");
ok("호스트 대소문자·#·끝 슬래시 무시", twinUrlKey("https://SkinLog.vercel.app/#top") === twinUrlKey("https://skinlog.vercel.app"));
ok("쿼리가 다르면 다른 주소", twinUrlKey("https://a.app/?v=2") !== twinUrlKey("https://a.app/"));
ok("경로가 다르면 다른 작품", findPublishedTwin({ title: "딴것", demoUrl: "https://skinlog.vercel.app/other" }, pub) === null);

// ── (2) 파일 업로드 주소 ──
ok("미리보기 주소는 비교 안 함", twinUrlKey("/api/preview/u/p2/index.html") === null);
ok("다른 행의 미리보기 주소 + 다른 제목 = 없음", findPublishedTwin({ title: "새 앱", demoUrl: "/api/preview/u/x/index.html" }, pub) === null);

// ── (3) 제목 ──
ok("파일 업로드는 제목으로 = title", findPublishedTwin({ title: "온습도계", demoUrl: "/api/preview/u/x/index.html" }, pub)?.by === "title");
ok("다른 언어 판 제목끼리", findPublishedTwin({ title: "홈 기후", otherTitles: ["home  climate MONITOR"] }, pub)?.id === "p2");
ok("전각·공백 무시", twinTitleKey("ＳｋｉｎＬｏｇ ") === twinTitleKey("skinlog"));
ok("구두점은 다른 제목", twinTitleKey("SkinLog!") !== twinTitleKey("SkinLog"));
ok("빈 제목은 안 엮음", findPublishedTwin({ title: "  " }, [{ id: "z", title: "" }]) === null);
ok("translations jsonb → 제목들", JSON.stringify(translationTitles({ en: { title: "A" }, ko: { title: " " }, x: 3 })) === '["A"]');
ok("translations 이상한 값", translationTitles(null).length === 0 && translationTitles([1]).length === 0);

// ── (4) 자기 자신·순서 ──
ok("자기 자신은 빼기", findPublishedTwin({ id: "p1", title: "스킨로그", demoUrl: "https://skinlog.vercel.app" }, pub) === null);
const both = [
  { id: "t", title: "같은 제목", demoUrl: "https://b.app" },
  { id: "u", title: "다른 제목", demoUrl: "https://a.app" },
];
ok("주소가 제목보다 먼저", findPublishedTwin({ title: "같은 제목", demoUrl: "https://a.app" }, both)?.id === "u");

if (failed) {
  console.error(`\n✗ ${failed}개 실패`);
  process.exit(1);
}
console.log("\n✓ 전부 통과");
