// 영상 틀 'boardingpass'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Encode_Sans_Semi_Condensed, IBM_Plex_Sans_KR, Nanum_Gothic_Coding, Roboto_Mono } from "next/font/google";
import type { FaceSet } from "../fonts";

const encodeSemiCond = Encode_Sans_Semi_Condensed({ subsets: ["latin"], weight: ["500", "700"], preload: false });
const robotoMono = Roboto_Mono({ subsets: ["latin"], weight: ["500", "700"], preload: false });
const koIBMPlexSansKR = IBM_Plex_Sans_KR({ weight: ["400", "700"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    encodeSemiCond: encodeSemiCond.style.fontFamily,
    robotoMono: robotoMono.style.fontFamily,
  },
  ko: {
    encodeSemiCond: koIBMPlexSansKR.style.fontFamily,
    robotoMono: koNanumGothicCoding.style.fontFamily,
  },
};
