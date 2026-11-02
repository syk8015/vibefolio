// 초안 파일 열쇠(lib/previewToken.ts)·공개 때 썸네일(lib/thumbnail.ts publishThumbnail) — 순수 함수. `npm test`.
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "probe-secret-not-real";
const { mintWith, verifyWith, splitPreviewPath, tokenizedPreviewPath, isTokenSegment, previewTokenSecret } = await import("../lib/previewToken");
const { publishThumbnail, screenshotUrl } = await import("../lib/thumbnail");
const { validPreviewFolder } = await import("../lib/previewAccess");

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const S = "secret-a";
const U = "11111111-2222-4333-8444-555555555555";
const F = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const now = Date.UTC(2026, 10, 2);
const tok = mintWith(S, U, F, 3600, now);

ok("열쇠 모양 ~v1.<만료>.<서명43>", /^~v1\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(tok), tok.slice(0, 20));
ok("같은 폴더·시간 안 → 열림", verifyWith(S, tok, U, F, now + 1000));
ok("만료 뒤 → 닫힘", !verifyWith(S, tok, U, F, now + 3601_000));
ok("다른 폴더 → 닫힘", !verifyWith(S, tok, U, "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee", now));
ok("다른 사람 → 닫힘", !verifyWith(S, tok, "99999999-2222-4333-8444-555555555555", F, now));
ok("다른 비밀 → 닫힘", !verifyWith("secret-b", tok, U, F, now));
const [, exp, sig] = tok.split(".");
ok("만료를 늘리면 → 닫힘", !verifyWith(S, `~v1.${Number(exp) + 99999}.${sig}`, U, F, now));
ok("서명 한 글자 바꾸면 → 닫힘", !verifyWith(S, `~v1.${exp}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`, U, F, now));
ok("이상한 모양 → 닫힘(던지지 않음)", !verifyWith(S, "~v2.x.y", U, F, now) && !verifyWith(S, "~", U, F, now) && !verifyWith(S, "", U, F, now));
ok("~ 칸 알아봄", isTokenSegment("~v1.1.x") && !isTokenSegment("index.html") && !isTokenSegment(undefined));

const p = splitPreviewPath(`/api/preview/${U}/${F}/sub/index.html?x=1`);
ok("주소 나누기", p?.uid === U && p?.folder === F && p?.rest === "sub/index.html", JSON.stringify(p));
ok("이미 열쇠가 든 주소는 안 나눔", splitPreviewPath(`/api/preview/${U}/${F}/${tok}/index.html`) === null);
ok("우리 업로드 주소 아니면 null", splitPreviewPath("https://example.com/x") === null && splitPreviewPath(`/api/preview/${U}/index.html`) === null);
const tp = tokenizedPreviewPath(`/api/preview/${U}/${F}/index.html`) ?? "";
const seg = tp.split("/")[5];
ok("열쇠 주소: 폴더 다음 칸에 열쇠, uid는 3번째 칸 그대로", tp.split("/")[3] === U && isTokenSegment(seg) && tp.endsWith("/index.html"), tp.slice(0, 60));
ok("열쇠 주소의 열쇠가 실제 비밀로 맞음", verifyWith(previewTokenSecret(), seg, U, F));

ok("폴더 모양: UUID 통과", validPreviewFolder(U, F));
ok("폴더 모양: _ · % · . 거절", !validPreviewFolder(U, "a_b") && !validPreviewFolder(U, "a%b") && !validPreviewFolder(U, "a.b"));
ok("폴더 모양: uid가 UUID 아니면 거절", !validPreviewFolder("abc", F));

const O = "https://nookframe.com";
const pub = `/api/preview/${U}/${F}/index.html`;
const t1 = publishThumbnail(pub, null, O, now);
ok("공개 썸네일: 없으면 새로(?v= 붙음)", !!t1 && t1.startsWith(screenshotUrl(`${O}${pub}?v=`)), t1 ?? "");
ok("공개 썸네일: 예전 thum.io 자동 썸네일은 새로", !!publishThumbnail(pub, screenshotUrl(`${O}${pub}`), O, now));
ok("공개 썸네일: 제작자 그림은 그대로", publishThumbnail(pub, "https://media.nookframe.com/files/x/_media/shot.png", O, now) === null);
ok("공개 썸네일: 소스 zip(HTML 아님)은 안 만듦", publishThumbnail(`/api/preview/${U}/${F}/package.json`, null, O, now) === null);
ok("공개 썸네일: 바깥 주소는 안 만듦(그건 다른 길)", publishThumbnail("https://example.com/", null, O, now) === null);

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
