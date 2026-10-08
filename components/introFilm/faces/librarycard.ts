// 영상 틀 'librarycard'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Cutive_Mono, Do_Hyeon, Gaegu, Kalam, Nanum_Myeongjo, Oswald } from "next/font/google";
import type { FaceSet } from "../fonts";

const cutiveMono = Cutive_Mono({ subsets: ["latin"], weight: ["400"], preload: false });
const kalam = Kalam({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const oswald = Oswald({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const koDoHyeon = Do_Hyeon({ weight: ["400"], preload: false });
const koGaegu = Gaegu({ weight: ["400", "700"], preload: false });
const koNanumMyeongjo = Nanum_Myeongjo({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    cutiveMono: cutiveMono.style.fontFamily,
    kalam: kalam.style.fontFamily,
    oswald: oswald.style.fontFamily,
  },
  ko: {
    cutiveMono: koNanumMyeongjo.style.fontFamily,
    kalam: koGaegu.style.fontFamily,
    oswald: koDoHyeon.style.fontFamily,
  },
};
