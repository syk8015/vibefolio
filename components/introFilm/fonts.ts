// 소개 영상 글꼴 — next/font가 우리 서버에서 내려준다(구글에 요청하지 않음). 미리보기·명함·워커 렌더가
// 같은 파일을 쓰므로 글자 폭이 같다. 이름은 next/font가 붙인 실제 CSS 이름으로 바꿔 엔진에 넘긴다.
import { Bricolage_Grotesque, Caveat, Gaegu, Gothic_A1, Inter, JetBrains_Mono } from "next/font/google";
import { INTRO_FONTS } from "@/lib/introFilm/styles";

const grot = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], preload: false });
const hand = Caveat({ subsets: ["latin"], weight: "700", preload: false });
const handKo = Gaegu({ weight: "700", preload: false });
const ko = Gothic_A1({ weight: ["400", "500", "600", "700", "800"], preload: false });
const ui = Inter({ subsets: ["latin"], weight: ["200", "300", "400", "600"], preload: false });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], preload: false });

export const INTRO_FONT_MAP: Record<string, string> = {
  [INTRO_FONTS.grot]: grot.style.fontFamily,
  [INTRO_FONTS.hand]: hand.style.fontFamily,
  [INTRO_FONTS.handKo]: handKo.style.fontFamily,
  [INTRO_FONTS.ko]: ko.style.fontFamily,
  [INTRO_FONTS.ui]: ui.style.fontFamily,
  [INTRO_FONTS.mono]: mono.style.fontFamily,
};

/**
 * 그리기 전에 글꼴을 다 받는다(글자 폭을 재서 배치하므로). 3초가 지나면 있는 대로 그린다.
 * text = 영상에 실제로 나올 글자 전부 — 한글 글꼴은 글자 묶음(unicode-range)별로 나뉘어 있어서, 견본 몇 자만
 * 받으면 나머지 글자는 대체 글꼴로 재져 단어 간격이 틀렸다(10-02: "밤낮없이돌아가요"가 붙어 보였다).
 */
export async function loadIntroFonts(locale: "en" | "ko", text = ""): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const sample = (locale === "ko" ? "가나다Aa0" : "Aa0") + text;
  const specs: string[] = [
    `800 100px ${INTRO_FONT_MAP[INTRO_FONTS.grot]}`, `700 100px ${INTRO_FONT_MAP[INTRO_FONTS.grot]}`,
    `700 100px ${INTRO_FONT_MAP[INTRO_FONTS.hand]}`,
    `200 100px ${INTRO_FONT_MAP[INTRO_FONTS.ui]}`, `300 100px ${INTRO_FONT_MAP[INTRO_FONTS.ui]}`,
    `400 20px ${INTRO_FONT_MAP[INTRO_FONTS.ui]}`, `600 20px ${INTRO_FONT_MAP[INTRO_FONTS.ui]}`,
    `500 20px ${INTRO_FONT_MAP[INTRO_FONTS.mono]}`,
  ];
  if (locale === "ko") {
    specs.push(`700 100px ${INTRO_FONT_MAP[INTRO_FONTS.handKo]}`);
    for (const w of [400, 500, 600, 700, 800]) specs.push(`${w} 100px ${INTRO_FONT_MAP[INTRO_FONTS.ko]}`);
  }
  const all = Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => [])));
  await Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}
