// 지금 코드에 있는 홈 문구 4묶음을 밤 작업이 읽을 JSON으로 뽑는다(2026-11-05).
// launchd 사본은 레포(~/Desktop)를 못 읽어서, install.sh가 이걸 돌려 사본 옆에 둔다.
// 문구를 고친 뒤엔 install.sh를 다시 돌릴 것(겹침 검사·최신화 제안이 이 목록을 본다).
//   npx tsx scripts/memes/export-existing.mts <출력 경로>
import { writeFileSync } from "node:fs";
import { taglineIntros, taglineIntrosEn, taglines, taglinesEn } from "../../lib/taglines";
import { loggedInTaglines, loggedInTaglinesEn } from "../../lib/loggedInTaglines";

const out = process.argv[2];
if (!out) throw new Error("usage: export-existing.mts <out.json>");
const plain = (lang: "ko" | "en", pool: string, arr: string[]) => arr.map((text) => ({ lang, pool, text, reply: null }));
const qa = (lang: "ko" | "en", pool: string, arr: { text: string; reply?: string }[]) =>
  arr.map((l) => ({ lang, pool, text: l.text, reply: l.reply ?? null }));
const lines = [
  ...plain("ko", "intro", taglineIntros), ...plain("en", "intro", taglineIntrosEn),
  ...plain("ko", "logged_out", taglines), ...plain("en", "logged_out", taglinesEn),
  ...qa("ko", "logged_in", loggedInTaglines), ...qa("en", "logged_in", loggedInTaglinesEn),
];
writeFileSync(out, JSON.stringify({ exportedAt: new Date().toISOString(), count: lines.length, lines }, null, 2) + "\n");
console.log(`✓ ${lines.length}줄 → ${out}`);
