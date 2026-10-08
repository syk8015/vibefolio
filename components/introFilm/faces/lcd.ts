// 영상 틀 'lcd'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Chakra_Petch, Nanum_Gothic_Coding } from "next/font/google";
import type { FaceSet } from "../fonts";

const chakraPetch = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    chakraPetch: chakraPetch.style.fontFamily,
    pixelKo: koNanumGothicCoding.style.fontFamily,
  },
  ko: {
    chakraPetch: koNanumGothicCoding.style.fontFamily,
  },
};
