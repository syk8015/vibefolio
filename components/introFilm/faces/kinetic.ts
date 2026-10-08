// 영상 틀 'kinetic'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Anybody, Gothic_A1, Nanum_Gothic_Coding, Space_Mono } from "next/font/google";
import type { FaceSet } from "../fonts";

const anybody = Anybody({ subsets: ["latin"], weight: "variable", axes: ["wdth"], preload: false });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const koGothicA1 = Gothic_A1({ weight: ["400", "700"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    anybody: anybody.style.fontFamily,
    spaceMono: spaceMono.style.fontFamily,
  },
  ko: {
    anybody: koGothicA1.style.fontFamily,
    spaceMono: koNanumGothicCoding.style.fontFamily,
  },
};
