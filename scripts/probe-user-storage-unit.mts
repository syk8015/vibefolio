// 사용자 파일 저장(R2) 판정(네트워크 없음) — lib/userStorage.ts.
// 사용: `npx -y tsx scripts/probe-user-storage-unit.mts`
//
// 무엇을 보나: (1) 키 = 뿌리(files/·avatars/) + 옛 경로 그대로 (2) 같은 사이트 문제 — 그림·영상만 진짜
// 형식, HTML·JS·SVG·확장자 속임은 내려받기 전용 (3) 공개 주소 ↔ 경로(새 R2 주소와 옛 Supabase 주소 둘 다,
// 남의 주소·`..`는 거절) (4) 관리자 클라이언트 감싸기 — storage만 바뀌고 나머지 메서드는 원래 this로.
process.env.R2_PUBLIC_URL_BASE = "https://media.nookframe.com";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://abc.supabase.co";

const { userFileKey, userFilePublicUrl, userFilePathFromUrl, storedObjectHeaders, withUserStorage, userStorage } =
  await import("../lib/userStorage");

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// (1)
ok("project-files → files/", userFileKey("project-files", "u/p/index.html") === "files/u/p/index.html");
ok("avatars → avatars/", userFileKey("avatars", "/u/avatar.png") === "avatars/u/avatar.png");
ok("공개 주소", userFilePublicUrl("project-files", "u/p/a.png") === "https://media.nookframe.com/files/u/p/a.png");

// (2)
const h = (p: string, t?: string) => storedObjectHeaders(p, t);
ok("png = image/png 그대로", h("a/b.png", "image/png").ContentType === "image/png" && !h("a/b.png").ContentDisposition);
ok("jpg 요청 형식이 다른 그림이어도 확장자 형식", h("a/b.jpg", "image/png").ContentType === "image/jpeg");
ok("mp4 = video/mp4", h("a/v.mp4", "video/mp4").ContentType === "video/mp4");
ok("mov = video/quicktime", h("a/v.mov").ContentType === "video/quicktime");
for (const p of ["a/index.html", "a/app.js", "a/style.css", "a/logo.svg", "a/data.json", "a/x", "a/.htaccess"]) {
  const r = h(p, "text/html");
  ok(`${p} → 내려받기 전용`, r.ContentType === "application/octet-stream" && r.ContentDisposition === "attachment", r.ContentType);
}
ok("이름만 .png에 형식은 text/html → 내려받기", h("a/evil.png", "text/html").ContentType === "application/octet-stream");
ok("캐시는 짧게(같은 키 재사용 경로)", /max-age=300/.test(h("a/b.png").CacheControl));

// (3)
const r2 = userFilePathFromUrl("https://media.nookframe.com/files/u/p/_media/screenshot.png");
ok("R2 주소 → 경로", r2?.bucket === "project-files" && r2.path === "u/p/_media/screenshot.png" && !r2.legacy);
const av = userFilePathFromUrl("https://media.nookframe.com/avatars/u/avatar.png?v=1");
ok("프로필 사진 주소(쿼리 무시)", av?.bucket === "avatars" && av.path === "u/avatar.png");
const old = userFilePathFromUrl("https://abc.supabase.co/storage/v1/object/public/project-files/u/videos/x%20y.mp4");
ok("옛 Supabase 주소 → 경로(디코드)", old?.bucket === "project-files" && old.path === "u/videos/x y.mp4" && old.legacy);
ok("촬영 영상 트리(뿌리 없음)는 사용자 파일 아님", userFilePathFromUrl("https://media.nookframe.com/u/p/demo-1.mp4") === null);
ok("남의 호스트는 null", userFilePathFromUrl("https://evil.com/files/u/p/a.png") === null);
ok("`..` 경로는 null", userFilePathFromUrl("https://media.nookframe.com/files/u/%2e%2e/v/a.png") === null);
ok("빈 값·이상한 값 null", userFilePathFromUrl("") === null && userFilePathFromUrl("not a url") === null);

// (4)
class FakeAdmin {
  #secret = "rows";
  storage = { from: () => "supabase" };
  from(t: string) {
    return `${this.#secret}:${t}`;
  }
}
const wrapped = withUserStorage(new FakeAdmin());
ok("감싼 뒤 storage = R2 쪽", wrapped.storage === userStorage);
ok("표 메서드는 원래 객체에 묶임(비공개 필드 접근)", wrapped.from("projects") === "rows:projects");
let threw = false;
try {
  userStorage.from("other-bucket");
} catch {
  threw = true;
}
ok("모르는 버킷은 거절", threw);

console.log(failed ? `\n✗ ${failed} failed` : "\nall user-storage unit probes passed");
process.exit(failed ? 1 : 0);
