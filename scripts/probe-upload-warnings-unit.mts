// 올린 파일 속 개인정보 경고(2026-10-02, lib/uploadWarnings.ts). 네트워크 없음.
// 지키는 것: 진짜 이메일·MAC·데이터 폴더는 잡고, 자리표시·라이브러리·이미지 표기는 안 잡는다.
// 경고 줄에 값 자체(주소)가 실리지 않는다 — AI 채팅 기록에 남으니까.
import { scanUploadWarnings, formatUploadWarnings } from "../lib/uploadWarnings";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const enc = (s: string) => new TextEncoder().encode(s);
const file = (relativePath: string, text: string) => ({ relativePath, data: enc(text) });
const blob = (relativePath: string, bytes: number) => ({ relativePath, data: new Uint8Array(bytes).fill(44) });

// 1. 이메일 — 진짜 주소는 잡고 같은 주소는 한 번만 센다.
{
  const w = scanUploadWarnings([file("index.html", "문의: kim.minsu@gmail.com / kim.minsu@gmail.com, hello@studio.kr")]);
  ok("진짜 이메일 2개(중복 1개 합침)", w.emails.length === 1 && w.emails[0].count === 2, JSON.stringify(w.emails));
}
// 2. 자리표시·자동 주소·이미지 표기·버전 표기는 무시.
{
  const w = scanUploadWarnings([file("app.js", [
    "you@example.com", "noreply@acme.io", "123+bot@users.noreply.github.com",
    "logo@2x.png", "react@18.2.0", "icon@3x.webp", "test@test.com",
  ].join(" "))]);
  ok("자리표시·노리플라이·@2x·버전은 안 잡음", w.emails.length === 0, JSON.stringify(w.emails));
}
// 3. 라이브러리 묶음·잠금 파일·소스맵·node_modules는 건너뜀.
{
  const w = scanUploadWarnings([
    file("assets/vendor.min.js", "author: real.person@corp.com"),
    file("package-lock.json", "real.person@corp.com"),
    file("assets/index.js.map", "real.person@corp.com"),
    file("node_modules/x/index.js", "real.person@corp.com"),
    file("LICENSE", "real.person@corp.com"),
  ]);
  ok("min.js·lock·map·node_modules·LICENSE 건너뜀", w.emails.length === 0, JSON.stringify(w.emails));
}
// 4. 이미지 같은 글자 아닌 파일은 안 읽는다.
ok("png 안은 안 읽음", scanUploadWarnings([file("a.png", "x@corp.com")]).emails.length === 0);
// 5. MAC 주소 — 진짜는 잡고, 00·ff 채움은 무시.
{
  const w = scanUploadWarnings([file("secrets-free/config.yaml", "sensor: A4:C1:38:12:34:56\nbroadcast: ff:ff:ff:ff:ff:ff\nzero: 00:00:00:00:00:00\nsame: a4-c1-38-12-34-56")]);
  ok("MAC 1개(대소문자·하이픈 같은 값 합침), 채움 값 무시", w.macs.length === 1 && w.macs[0].count === 1, JSON.stringify(w.macs));
}
// 6. 데이터 폴더 — 2MB 이상 또는 30개 이상. 작은 설정 JSON은 데이터로 안 센다.
{
  const w = scanUploadWarnings([
    blob("data/readings.csv", 3 * 1024 * 1024),
    blob("data/old.sqlite", 100),
    file("manifest.json", "{}"),
    file("config/settings.json", "{}"),
    blob("small/a.csv", 1000),
  ]);
  ok("data/ 폴더만 잡힘(파일 2개)", w.dataFolders.length === 1 && w.dataFolders[0].folder === "data" && w.dataFolders[0].files === 2, JSON.stringify(w.dataFolders));
  const many = scanUploadWarnings(Array.from({ length: 30 }, (_, i) => blob(`logs/day${i}.log`, 10)));
  ok("작아도 30개면 잡힘", many.dataFolders.length === 1 && many.dataFolders[0].folder === "logs");
  const bigJson = scanUploadWarnings([blob("dump.json", 3 * 1024 * 1024)]);
  ok("맨 위의 큰 JSON은 (top level)", bigJson.dataFolders[0]?.folder === "(top level)", JSON.stringify(bigJson.dataFolders));
}
// 7. 경고 줄 — 값 자체는 없고, 마지막에 할 일이 있다. 아무것도 없으면 빈 배열.
{
  const lines = formatUploadWarnings(scanUploadWarnings([
    file("index.html", "kim.minsu@gmail.com"),
    file("esp/config.yaml", "A4:C1:38:12:34:56"),
    blob("data/r.csv", 3 * 1024 * 1024),
  ]));
  const all = lines.join("\n");
  ok("세 종류 + 할 일 = 4줄", lines.length === 4, String(lines.length));
  ok("주소 값이 줄에 안 실림", !all.includes("kim.minsu") && !all.toLowerCase().includes("a4:c1"), all);
  ok("파일 이름·개수는 실림", all.includes("index.html (1)") && all.includes("data/ (1 files, 3.0MB)"), all);
  ok("마지막 줄은 주인에게 물으라는 할 일", /Ask the owner/.test(lines[3] ?? ""));
  ok("깨끗하면 빈 배열", formatUploadWarnings(scanUploadWarnings([file("index.html", "<h1>hi</h1>")])).length === 0);
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
