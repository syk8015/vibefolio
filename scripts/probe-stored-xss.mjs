// 저장형 XSS 실서버 E2E (위협 목록 A1) — 사용자가 쓸 수 있는 글·주소 칸에 공격 문자열을
// 심고, 진짜 브라우저(헤드리스 크롬)로 공개 화면을 열어 스크립트가 한 번도 안 도는지 본다.
//
// 왜 브라우저까지: 대시보드는 profiles·projects를 **사용자 키로 직접** 쓴다 — 서버 검사가
// 없고 DB가 받는 대로 저장된다. 그래서 막는 곳은 화면 쪽(React 이스케이프·safeHref·
// watchTryHref·JsonLd의 `<` 치환)뿐이고, 그게 실제로 서 있는지는 그려 봐야 안다.
//
// 검증: (1) 사용자 키로 공격 문자열이 저장되는지(저장돼야 이 검사가 의미 있다 — 거절되면 표시)
// (2) 명함·작품 화면·첫 화면을 ko·en 두 언어로 열어 스크립트 실행 흔적 0, 대화창 0
// (3) HTML 원문에 이스케이프 안 된 태그 없음 (4) 실행되는 속성(on*·href·iframe src…)에 표식 없음
// (5) 사용자 키로 is_draft=false를 직접 쓸 수 있는지 — 기록만. 대시보드 [공개]가 원래 이 길이라
//     주인이 자기 작품을 여는 건 설계대로다(보안 경계 아님).
//
// ⚠️ 검사하는 동안(약 1분) 작품이 공개 상태라 첫 화면 목록에 probe 계정이 잠깐 뜬다.
//    끝나면 계정째 지운다(캐시는 60초 안에 빠진다). 이름·제목은 눈에 띄게 "NF probe"로 시작.
// 사용: 레포 루트에서 `node scripts/probe-stored-xss.mjs` (크롬 필요 — playwright-core가 설치된 크롬을 씀)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { chromium } from "playwright-core";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 240)}` : ""}`);
  if (!pass) failed++;
};
const note = (msg) => console.log(`- ${msg}`);

// 표식: 실행되면 window.__nfx 배열에 칸 이름이 쌓인다. 속성 스캔은 "__nfx" 글자를 찾는다.
const run = (tag) => `(self.__nfx=self.__nfx||[]).push('${tag}')`;
const html = (tag) =>
  `NF probe ${tag} <img src=x onerror="${run(tag)}"><svg onload="${run(tag + "-svg")}"></svg>` +
  `</script><script>${run(tag + "-script")}</script>"'><iframe srcdoc="<script>parent.${run(tag + "-srcdoc")}</script>">`;
const jsUrl = (tag) => `javascript:${run(tag)}//https://github.com/x`;

let userId = null;
let browser = null;
try {
  const stamp = Date.now();
  const username = `nfprobexss${stamp}`.slice(0, 30);
  const email = `delivered+nfprobe-xss-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { username },
  });
  if (cErr) throw cErr;
  userId = created.user.id;
  const { data: link, error: lErr } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw lErr;
  const user = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error: vErr } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  const ref = new URL(URL_).hostname.split(".")[0];
  const authCookies = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)));

  // ── (1) 사용자 키로 저장 — 대시보드와 같은 길 ──
  {
    const { error } = await user.from("profiles").upsert({
      id: userId,
      username,
      name: html("name"),
      bio: html("bio"),
      avatar_url: jsUrl("avatar"),
      social_links: [jsUrl("social"), `https://github.com/x" onmouseover="${run("social-attr")}`, "github.com/nfprobe"],
      updated_at: new Date().toISOString(),
    });
    ok("사용자 키: 공격 문자열로 명함 저장됨(DB가 안 거름 → 화면이 막아야 함)", !error, error?.message);
  }
  const base = {
    user_id: userId,
    title: html("title"),
    description: html("desc"),
    comment: html("comment"),
    tags: [html("tag")],
    demo_url: jsUrl("demo"),
    thumbnail: jsUrl("thumb"),
    video_url: jsUrl("video"),
    is_draft: true,
    primary_locale: "ko",
    translations: { en: { title: html("tr-title"), description: html("tr-desc"), builderNote: html("tr-note") } },
  };
  let projectId = null;
  {
    let row = { ...base };
    for (let i = 0; i < 6 && !projectId; i++) {
      const { data, error } = await user.from("projects").insert(row).select("id").single();
      if (!error) { projectId = data.id; break; }
      const col = Object.keys(row).find((k) => error.message.includes(k) && k !== "user_id");
      note(`사용자 키 insert 거절: ${error.code} ${error.message}${col ? ` → ${col} 빼고 다시` : ""}`);
      if (!col) break;
      delete row[col];
    }
    ok("사용자 키: 공격 문자열로 작품 저장됨", !!projectId);
    if (!projectId) throw new Error("작품을 못 만들어 화면 검사를 못 함");
  }

  // ── (5) 발행 게이트 우회 시도 — 기록만 ──
  {
    await user.from("projects").update({ is_draft: false }).eq("id", projectId);
    const { data } = await svc.from("projects").select("is_draft").eq("id", projectId).single();
    note(`사용자 키로 is_draft=false 직접 쓰기: ${data?.is_draft === false ? "됨(발행 게이트를 안 거침)" : "막힘"}`);
  }
  // 화면을 보려면 공개 상태 + 자막(워커 전용 칸)이 필요 — 관리자 권한으로 채운다.
  {
    const { error } = await svc.from("projects").update({
      is_draft: false,
      demo_video_url: "https://nookframe.com/__nfprobe__.mp4",
      demo_captions: { en: [{ start: 0, end: 30, text: html("caption") }], ko: [{ start: 0, end: 30, text: html("caption-ko") }] },
    }).eq("id", projectId);
    if (error) note(`관리자 권한 공개 전환 실패: ${error.message}`);
  }

  // ── (2)~(4) 브라우저 ──
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const pages = [`/${username}`, `/${username}/${projectId}`, `/${username}?showcase=1`, `/`];
  for (const locale of ["ko", "en"]) {
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: ORIGIN }]);
    for (const path of pages) {
      const page = await ctx.newPage();
      const dialogs = [];
      page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
      const res = await page.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}nfp=${stamp}`, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => e);
      if (res instanceof Error) { ok(`[${locale}] ${path} 열림`, false, res.message); await page.close(); continue; }
      // 링크 위에 올려 보고(onmouseover), 첫 화면이면 목록이 늦게 뜰 수 있어 잠깐 더 둔다.
      await page.mouse.move(10, 10);
      for (const a of await page.$$("a[href*='github.com']")) await a.hover({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const fired = await page.evaluate(() => self.__nfx ?? []);
      const attrs = await page.evaluate(() => {
        const hits = [];
        for (const el of document.querySelectorAll("*")) {
          for (const at of el.attributes) {
            // 실행되는 자리만 센다. <img src>·<video poster>의 javascript: 주소는 브라우저가
            // 이동이 아닌 그림 요청으로 다뤄 절대 실행하지 않는다(쓰레기 값일 뿐 공격 아님).
            const tag = el.tagName.toLowerCase();
            const runs =
              at.name.startsWith("on") ||
              ["href", "srcdoc", "action", "formaction", "xlink:href"].includes(at.name) ||
              (at.name === "src" && ["iframe", "frame", "embed", "script"].includes(tag)) ||
              (at.name === "data" && tag === "object");
            // 주소 칸은 스킴이 javascript:·data:·vbscript:일 때만 실행된다 — https 주소 속에
            // 따옴표·표식이 글자로 든 건(속성을 못 깨고 갇힌 것) 무해하다.
            const urlAttr = at.name !== "srcdoc" && !at.name.startsWith("on");
            const live = urlAttr ? /^\s*(javascript|data|vbscript):/i.test(at.value) : true;
            if (runs && live && at.value.includes("__nfx")) {
              hits.push(`${el.tagName.toLowerCase()}[${at.name}]=${at.value.slice(0, 60)}`);
            }
          }
        }
        return hits;
      });
      const raw = await res.text().catch(() => "");
      const rawHit = /<img src=x onerror|<svg onload|<script>\(self\.__nfx|<iframe srcdoc/i.test(raw);
      const shown = raw.includes("NF probe");
      ok(
        `[${locale}] ${path}: 스크립트 실행 0 · 대화창 0 · 위험 속성 0 · 원문 이스케이프${shown ? "" : " (probe 글이 원문에 없음)"}`,
        fired.length === 0 && dialogs.length === 0 && attrs.length === 0 && !rawHit,
        [fired.length && `실행=${fired.join(",")}`, dialogs.length && `대화창=${dialogs.join(",")}`, attrs.length && `속성=${attrs.join(" | ")}`, rawHit && "원문에 날 태그"].filter(Boolean).join(" · "),
      );
      await page.close();
    }
    await ctx.close();
  }

  // 주인 화면: 대시보드(작품 목록·명함 편집 칸)
  {
    const ctx = await browser.newContext();
    await ctx.addCookies(authCookies.map((c) => ({ name: c.name, value: c.value, url: ORIGIN })));
    const page = await ctx.newPage();
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    for (const path of ["/dashboard", "/dashboard?tab=card"]) {
      await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const fired = await page.evaluate(() => self.__nfx ?? []);
      const landed = new URL(page.url()).pathname;
      ok(`[주인] ${path}: 스크립트 실행 0 · 대화창 0`, fired.length === 0 && dialogs.length === 0, `도착=${landed} ${fired.join(",")} ${dialogs.join(",")}`);
    }
    await ctx.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  if (userId) {
    await svc.from("projects").delete().eq("user_id", userId);
    await svc.from("profiles").delete().eq("id", userId);
    await svc.auth.admin.deleteUser(userId);
    const { data: left } = await svc.from("projects").select("id").eq("user_id", userId);
    ok("정리: probe 계정·작품 삭제", (left ?? []).length === 0);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall stored-xss probes passed");
process.exit(failed ? 1 : 0);
