// 영상 틀 'ascii'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Archivo, Courier_Prime, DM_Mono, Do_Hyeon, IBM_Plex_Mono, Nanum_Gothic_Coding } from "next/font/google";
import type { FaceSet } from "../fonts";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], preload: false });
const courierPrime = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const archivo = Archivo({ subsets: ["latin"], weight: ["800"], preload: false });
const koDoHyeon = Do_Hyeon({ weight: ["400"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    plexMono: plexMono.style.fontFamily,
    dmMono: dmMono.style.fontFamily,
    courierPrime: courierPrime.style.fontFamily,
    archivo: archivo.style.fontFamily,
  },
  ko: {
    plexMono: koNanumGothicCoding.style.fontFamily,
    dmMono: koNanumGothicCoding.style.fontFamily,
    courierPrime: koNanumGothicCoding.style.fontFamily,
    archivo: koDoHyeon.style.fontFamily,
  },
};
