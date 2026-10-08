// 영상 틀 'transit'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Gothic_A1, Nanum_Gothic_Coding, Overpass, Overpass_Mono } from "next/font/google";
import type { FaceSet } from "../fonts";

const overpass = Overpass({ subsets: ["latin"], weight: ["400", "700", "900"], preload: false });
const overpassMono = Overpass_Mono({ subsets: ["latin"], weight: ["500", "700"], preload: false });
const koGothicA1 = Gothic_A1({ weight: ["400", "700"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    overpass: overpass.style.fontFamily,
    overpassMono: overpassMono.style.fontFamily,
  },
  ko: {
    overpass: koGothicA1.style.fontFamily,
    overpassMono: koNanumGothicCoding.style.fontFamily,
  },
};
