// 영상 틀 'chartrecorder'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Architects_Daughter, Barlow_Condensed, Courier_Prime, Do_Hyeon, Gaegu, Gochi_Hand, IBM_Plex_Sans_Condensed, IBM_Plex_Sans_KR, Kalam, Nanum_Brush_Script, Nanum_Gothic_Coding } from "next/font/google";
import type { FaceSet } from "../fonts";

const architectsDaughter = Architects_Daughter({ subsets: ["latin"], weight: ["400"], preload: false });
const gochiHand = Gochi_Hand({ subsets: ["latin"], weight: ["400"], preload: false });
const kalam = Kalam({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const courierPrime = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "700"], preload: false });
const plexSansCondensed = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["400", "600"], preload: false });
const koDoHyeon = Do_Hyeon({ weight: ["400"], preload: false });
const koGaegu = Gaegu({ weight: ["400", "700"], preload: false });
const koIBMPlexSansKR = IBM_Plex_Sans_KR({ weight: ["400", "700"], preload: false });
const koNanumBrushScript = Nanum_Brush_Script({ weight: ["400"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    architectsDaughter: architectsDaughter.style.fontFamily,
    gochiHand: gochiHand.style.fontFamily,
    kalam: kalam.style.fontFamily,
    courierPrime: courierPrime.style.fontFamily,
    barlowCondensed: barlowCondensed.style.fontFamily,
    plexSansCondensed: plexSansCondensed.style.fontFamily,
  },
  ko: {
    architectsDaughter: koGaegu.style.fontFamily,
    gochiHand: koNanumBrushScript.style.fontFamily,
    kalam: koGaegu.style.fontFamily,
    courierPrime: koNanumGothicCoding.style.fontFamily,
    barlowCondensed: koDoHyeon.style.fontFamily,
    plexSansCondensed: koIBMPlexSansKR.style.fontFamily,
  },
};
