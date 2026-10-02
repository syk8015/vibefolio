// 올린 영상 줄이기 규칙(lib/videoTranscode.ts) — 네트워크 없음.
// 지키는 것: 줄인 파일(-nf.mp4)은 다시 안 집고, 영상 확장자만 집고, 별 효과 없으면 mp4는 상자만 바꾼다.
import { TRANSCODED_SUFFIX, isTranscodable, pickOutput, transcodeArgs, remuxArgs } from "../lib/videoTranscode";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

ok("영상 확장자는 집는다", ["a/videos/x.mp4", "a/videos/x.MOV", "a/b/_media/demo.webm", "a/videos/x.m4v"].every(isTranscodable));
ok("줄인 파일은 다시 안 집는다", !isTranscodable(`a/videos/x${TRANSCODED_SUFFIX}`));
ok("영상 아닌 파일은 안 집는다", !isTranscodable("a/thumbnails/x.png") && !isTranscodable("a/b/index.html") && !isTranscodable("a/videos/x"));
ok("많이 줄면 다시 누른 것", pickOutput("mov", 100, 30) === "encoded" && pickOutput("mp4", 100, 89) === "encoded");
ok("거의 안 줄면 mp4는 상자만", pickOutput("mp4", 100, 95) === "remux" && pickOutput("m4v", 100, 120) === "remux");
ok("거의 안 줄어도 mov·webm은 mp4로", pickOutput("mov", 100, 120) === "encoded" && pickOutput("webm", 100, 95) === "encoded");
const t = transcodeArgs("in", "out.mp4");
ok("빠른 시작(faststart)·H.264·소리 선택", t.includes("+faststart") && t.includes("libx264") && t.includes("0:a:0?") && t[t.length - 1] === "out.mp4");
ok("상자만 바꾸기는 다시 누르지 않는다", remuxArgs("in", "o").join(" ").includes("-c copy"));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
