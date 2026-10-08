// 영상 틀 'blueprint'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { B612, B612_Mono, IBM_Plex_Sans_KR, Nanum_Gothic_Coding } from "next/font/google";
import type { FaceSet } from "../fonts";

const b612 = B612({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const b612Mono = B612_Mono({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const koIBMPlexSansKR = IBM_Plex_Sans_KR({ weight: ["400", "700"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    b612: b612.style.fontFamily,
    b612Mono: b612Mono.style.fontFamily,
  },
  ko: {
    b612: koIBMPlexSansKR.style.fontFamily,
    b612Mono: koNanumGothicCoding.style.fontFamily,
  },
};
