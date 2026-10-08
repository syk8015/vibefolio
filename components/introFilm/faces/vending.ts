// 영상 틀 'vending'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Gaegu, Gothic_A1, Libre_Franklin, Nanum_Gothic_Coding, Permanent_Marker, Tiny5 } from "next/font/google";
import type { FaceSet } from "../fonts";

const tiny5 = Tiny5({ subsets: ["latin"], weight: ["400"], preload: false });
const libreFranklin = Libre_Franklin({ subsets: ["latin"], weight: ["500", "600", "700", "800", "900"], preload: false });
const permanentMarker = Permanent_Marker({ subsets: ["latin"], weight: ["400"], preload: false });
const koGaegu = Gaegu({ weight: ["400", "700"], preload: false });
const koGothicA1 = Gothic_A1({ weight: ["400", "700"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    tiny5: tiny5.style.fontFamily,
    libreFranklin: libreFranklin.style.fontFamily,
    permanentMarker: permanentMarker.style.fontFamily,
    pixelKo: koNanumGothicCoding.style.fontFamily,
  },
  ko: {
    tiny5: koNanumGothicCoding.style.fontFamily,
    libreFranklin: koGothicA1.style.fontFamily,
    permanentMarker: koGaegu.style.fontFamily,
  },
};
