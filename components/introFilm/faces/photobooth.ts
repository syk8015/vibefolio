// 영상 틀 'photobooth'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Do_Hyeon, Gaegu, IBM_Plex_Mono, Nanum_Gothic_Coding, Oswald, Permanent_Marker } from "next/font/google";
import type { FaceSet } from "../fonts";

const oswald = Oswald({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const permanentMarker = Permanent_Marker({ subsets: ["latin"], weight: ["400"], preload: false });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const koDoHyeon = Do_Hyeon({ weight: ["400"], preload: false });
const koGaegu = Gaegu({ weight: ["400", "700"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    oswald: oswald.style.fontFamily,
    permanentMarker: permanentMarker.style.fontFamily,
    plexMono: plexMono.style.fontFamily,
  },
  ko: {
    oswald: koDoHyeon.style.fontFamily,
    permanentMarker: koGaegu.style.fontFamily,
    plexMono: koNanumGothicCoding.style.fontFamily,
  },
};
