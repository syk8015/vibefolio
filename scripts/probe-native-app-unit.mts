// 못 찍는 앱 판별(lib/nativeApp.ts) — 네트워크 없음.
// 지키는 것: 데스크톱(Electron·Tauri)·브라우저 확장을 알아보되, 웹으로 찍을 수 있는
// 것(정적 사이트·웹 서버를 같이 띄우는 Electron 구성)은 건드리지 않는다.
import { detectNativeApp, isElectronLaunchScript, isNativePlatform } from "../lib/nativeApp";
import { pickZipAnchor } from "../lib/upload-safety";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const det = (name: string, paths: string[], want: string | null) => {
  const got = detectNativeApp(paths);
  ok(name, got === want, String(got));
};

// 기존 셋은 그대로
det("ios", ["MyApp.xcodeproj/project.pbxproj", "MyApp/ContentView.swift"], "ios");
det("android", ["app/src/main/AndroidManifest.xml", "build.gradle.kts"], "android");
det("unity가 android보다 먼저", ["ProjectSettings/ProjectVersion.txt", "build.gradle"], "unity");

// 새 셋
det("tauri", ["src-tauri/tauri.conf.json", "src-tauri/src/main.rs", "src/App.tsx"], "tauri");
det("tauri 모바일 폴더가 있어도 tauri", ["src-tauri/tauri.conf.json", "src-tauri/gen/android/build.gradle.kts"], "tauri");
det("electron-builder", ["electron-builder.yml", "main.js", "renderer/app.js"], "electron");
det("electron forge", ["forge.config.js", "src/main.ts"], "electron");
det("electron-vite", ["electron.vite.config.ts", "src/main/index.ts"], "electron");
det("크롬 확장(빌드 없는 것)", ["manifest.json", "popup.html", "background.js"], "extension");
ok("크롬 확장 zip은 앵커가 없어 판별까지 닿는다", pickZipAnchor([{ relativePath: "manifest.json" }, { relativePath: "popup.html" }]) === null);

// 웹으로 찍을 수 있는 것은 null
det("정적 사이트", ["index.html", "style.css"], null);
det("파이썬", ["app.py", "requirements.txt"], null);
ok("PWA 매니페스트는 index.html 앵커가 먼저 잡는다", pickZipAnchor([{ relativePath: "index.html" }, { relativePath: "manifest.json" }])?.kind === "html");

for (const p of ["electron", "tauri", "extension"]) ok(`isNativePlatform(${p})`, isNativePlatform(p));

// 실행 스크립트 — Electron으로 시작할 때만
const el = (s: string, want: boolean) => ok(`${JSON.stringify(s)} → ${want}`, isElectronLaunchScript(s) === want);
el("electron .", true);
el("electron-vite dev", true);
el("electron-forge start", true);
el("npx electron .", true);
el("cross-env NODE_ENV=development electron .", true);
el("vite", false);
el("next dev", false);
el('concurrently "vite" "electron ."', false);
el("electronic-music-server", false);
el("", false);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
