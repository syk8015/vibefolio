// 영상 틀 'cassette'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Architects_Daughter, Archivo_Narrow, Courier_Prime, Gaegu, Gothic_A1, Kalam, Nanum_Gothic_Coding, Permanent_Marker } from "next/font/google";
import type { FaceSet } from "../fonts";

const courierPrime = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const archivoNarrow = Archivo_Narrow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const kalam = Kalam({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const permanentMarker = Permanent_Marker({ subsets: ["latin"], weight: ["400"], preload: false });
const architectsDaughter = Architects_Daughter({ subsets: ["latin"], weight: ["400"], preload: false });
const koGaegu = Gaegu({ weight: ["400", "700"], preload: false });
const koGothicA1 = Gothic_A1({ weight: ["400", "700"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    courierPrime: courierPrime.style.fontFamily,
    archivoNarrow: archivoNarrow.style.fontFamily,
    kalam: kalam.style.fontFamily,
    permanentMarker: permanentMarker.style.fontFamily,
    architectsDaughter: architectsDaughter.style.fontFamily,
  },
  ko: {
    courierPrime: koNanumGothicCoding.style.fontFamily,
    archivoNarrow: koGothicA1.style.fontFamily,
    kalam: koGaegu.style.fontFamily,
    permanentMarker: koGaegu.style.fontFamily,
    architectsDaughter: koGaegu.style.fontFamily,
  },
};
