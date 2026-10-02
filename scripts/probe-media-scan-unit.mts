// 공개 그림 내용 검사(2026-10-02, lib/mediaScan.ts)의 순수 함수. 네트워크·키 없음.
// 지키는 것: http(s) 주소만 · 이미 본 주소는 다시 안 봄(오류는 하루 뒤 다시) · 틱당 상한 ·
// 분류기 답 다듬기(목록 밖 분류 버림, 걸렸는데 빈 분류 → other) · 신고 사유 칸 매핑 · OpenAI 결과 매핑 ·
// 기본은 무료 분류기 · 키 없으면 꺼짐.
import { scannableUrl, pickUnscanned, sanitizeVerdict, reportReason, runMediaScan, verdictFromOpenAI, MEDIA_SCAN_PROVIDER, type MediaItem } from "../lib/mediaScan";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

ok("https 주소는 검사", scannableUrl("https://media.nookframe.com/files/a.png") === "https://media.nookframe.com/files/a.png");
ok("data: 주소는 뺌", scannableUrl("data:image/png;base64,AAA") === null);
ok("상대 경로는 뺌", scannableUrl("/api/preview/x.png") === null);
ok("글자 아님은 뺌", scannableUrl(null) === null);

const it = (n: number): MediaItem => ({ url: `https://x.test/${n}.png`, targetType: "project", targetId: `id${n}`, label: `t${n}` });
const now = Date.parse("2026-10-02T12:00:00Z");
const scanned = new Map([
  [it(1).url, { verdict: "ok", scannedAt: now - 1000 }],
  [it(2).url, { verdict: "error", scannedAt: now - 2 * 3_600_000 }],
  [it(3).url, { verdict: "error", scannedAt: now - 30 * 3_600_000 }],
  [it(4).url, { verdict: "flag", scannedAt: now - 90 * 86_400_000 }],
]);
const picked = pickUnscanned([it(1), it(2), it(3), it(4), it(5), it(5), it(6), it(7)], scanned, now, 3).map((x) => x.url);
ok("본 것·최근 오류·걸린 것은 건너뜀, 하루 지난 오류는 다시", picked.join(",") === [it(3).url, it(5).url, it(6).url].join(","), picked.join(","));
ok("같은 주소는 한 번만", new Set(picked).size === picked.length);

ok("정상 답", JSON.stringify(sanitizeVerdict({ verdict: "ok", categories: ["adult"], reason: "괜찮음" })) === JSON.stringify({ verdict: "ok", categories: [], reason: "괜찮음" }));
ok("걸렸는데 분류가 비면 other", sanitizeVerdict({ verdict: "flag", categories: [], reason: "" }).categories.join() === "other");
ok("목록 밖 분류는 버림", sanitizeVerdict({ verdict: "flag", categories: ["adult", "weird"], reason: "" }).categories.join() === "adult");
ok("이상한 답은 ok로(사람이 못 보는 대신 신고가 받침)", sanitizeVerdict("garbage").verdict === "ok");

ok("성인물·아동 → adult 사유", reportReason(["csam"]) === "adult" && reportReason(["adult", "hate"]) === "adult");
ok("피싱 → spam 사유", reportReason(["scam"]) === "spam");
ok("나머지 → other", reportReason(["violence"]) === "other");

// OpenAI 무료 검사 결과 → 판정
const oa = (cats: Record<string, boolean>, scores: Record<string, number> = {}) => verdictFromOpenAI({ categories: cats, category_scores: scores });
ok("OpenAI: 아무것도 안 걸리면 ok", oa({ sexual: false, violence: false }).verdict === "ok");
ok("OpenAI: sexual → adult로 걸림", oa({ sexual: true }, { sexual: 0.93 }).categories.join() === "adult" && oa({ sexual: true }, { sexual: 0.93 }).reason.includes("0.93"));
ok("OpenAI: sexual/minors → csam", oa({ "sexual/minors": true }).categories.join() === "csam");
ok("OpenAI: 일반 violence(게임 화면)는 안 건다", oa({ violence: true }).verdict === "ok");
ok("OpenAI: violence/graphic은 건다", oa({ "violence/graphic": true }).categories.join() === "violence");
ok("OpenAI: 이상한 결과는 ok", verdictFromOpenAI(undefined).verdict === "ok");

ok("기본 분류기는 무료(OpenAI)", MEDIA_SCAN_PROVIDER === "openai");
const saved = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
const off = await runMediaScan({} as never, { now });
ok("고른 쪽 키가 없으면 꺼짐(데이터 저장소도 안 건드림)", "off" in off && off.off === true);
if (saved) process.env.OPENAI_API_KEY = saved;

console.log(failed ? `\n${failed}개 실패` : "\n전부 통과");
process.exit(failed ? 1 : 0);
