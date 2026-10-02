// 끝맺음이 안 온 업로드 청소 판정(네트워크 없음) — lib/uploadSweep.ts.
// 사용: `npx -y tsx scripts/probe-upload-sweep-unit.mts`
//
// 무엇을 보나: (1) 빈 초안 — 파일 없는 초안만, 하루 지나야, 공개 작품·파일 붙은 초안은 제외
// (2) 세션 이름 → 시각(lib/ingestStore.ts newUploadSession과 같은 모양) (3) `_upload/` 목록에서
// 하루 지난 세션·교체 표식만 지우고 새 세션·모르는 폴더는 둔다 (4) 틱마다 도는 행 구간.
import {
  isAbandonedEmptyDraft, sessionStartedAt, staleUploadKeys, sweepWindow, UPLOAD_ABANDON_MS, TEMP_SWEEP_ROWS,
} from "../lib/uploadSweep";
import { newUploadSession } from "../lib/ingestStore";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const now = Date.parse("2026-09-30T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const H = 3_600_000;

// (1)
const base = { id: "p", user_id: "u", is_draft: true, demo_url: "", video_url: null, created_at: ago(25 * H) };
ok("파일 없는 초안, 25시간 → 청소", isAbandonedEmptyDraft(base, now));
ok("demo_url null도 빈 초안", isAbandonedEmptyDraft({ ...base, demo_url: null }, now));
ok("23시간은 아직 둔다", !isAbandonedEmptyDraft({ ...base, created_at: ago(23 * H) }, now));
ok("zip이 붙은 초안은 안 건드림", !isAbandonedEmptyDraft({ ...base, demo_url: "/api/preview/u/p/index.html" }, now));
ok("소개 영상 대본만 있는 초안은 안 건드림(명함이 대본을 재생)", !isAbandonedEmptyDraft({ ...base, intro_film: { style: {}, scenes: [] } }, now));
ok("URL 초안은 안 건드림", !isAbandonedEmptyDraft({ ...base, demo_url: "https://a.com" }, now));
ok("영상 초안은 안 건드림", !isAbandonedEmptyDraft({ ...base, video_url: "https://r2/x.mp4" }, now));
ok("공개 작품은 안 건드림", !isAbandonedEmptyDraft({ ...base, is_draft: false }, now));
ok("만든 시각을 모르면 둔다", !isAbandonedEmptyDraft({ ...base, created_at: null }, now));

// (2)
const s = newUploadSession();
const started = sessionStartedAt(s);
ok("새 세션 이름 → 지금 시각", started !== null && Math.abs(started - Date.now()) < 5_000, `${s} → ${started}`);
ok("세션 모양이 아니면 null", sessionStartedAt("replace.marker") === null && sessionStartedAt("abc") === null);

// (3)
const sess = (t: number) => `${t.toString(36).padStart(8, "0")}-${"a".repeat(12)}`;
const oldS = sess(now - 30 * H), newS = sess(now - 1 * H);
const P = "u/p";
const keys = staleUploadKeys(P, [
  { name: oldS, id: null },
  { name: newS, id: null },
  { name: "mystery", id: null },
  { name: "replace.marker", id: "m1", updated_at: ago(26 * H) },
], now);
ok("하루 지난 세션 파일 3개", ["bundle.zip", "screenshot.bin", "video.bin"].every((f) => keys.includes(`${P}/_upload/${oldS}/${f}`)));
ok("새 세션은 둔다", !keys.some((k) => k.includes(newS)));
ok("모르는 폴더는 둔다", !keys.some((k) => k.includes("mystery")));
ok("하루 지난 교체 표식은 지운다", keys.includes(`${P}/_upload/replace.marker`));
ok("새 교체 표식은 둔다", staleUploadKeys(P, [{ name: "replace.marker", id: "m", updated_at: ago(2 * H) }], now).length === 0);
ok("날짜 모르는 파일은 지운다", staleUploadKeys(P, [{ name: "bundle.zip", id: "x" }], now).length === 1);
ok("모든 키가 행 폴더 _upload 안", keys.every((k) => k.startsWith(`${P}/_upload/`)));
ok("경계: 딱 하루면 청소", staleUploadKeys(P, [{ name: sess(now - UPLOAD_ABANDON_MS), id: null }], now).length === 3);

// (4)
ok("행 0개면 구간 없음", sweepWindow(0, now) === null);
ok("적으면 전부", JSON.stringify(sweepWindow(7, now)) === JSON.stringify({ from: 0, to: 6 }));
{
  const total = 95, seen = new Set<number>();
  for (let i = 0; i < 10; i++) {
    const w = sweepWindow(total, i * 5 * 60_000)!;
    ok(`구간 ${i} 크기 ≤ ${TEMP_SWEEP_ROWS}`, w.to - w.from + 1 <= TEMP_SWEEP_ROWS && w.to < total);
    for (let r = w.from; r <= w.to; r++) seen.add(r);
  }
  ok("몇 틱이면 모든 행을 한 번씩", seen.size === total, `${seen.size}/${total}`);
}

if (failed) {
  console.error(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
