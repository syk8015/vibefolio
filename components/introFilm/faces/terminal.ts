// 영상 틀 'terminal'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Fira_Code, IBM_Plex_Mono, Nanum_Gothic_Coding, Red_Hat_Mono } from "next/font/google";
import type { FaceSet } from "../fonts";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const redhatMono = Red_Hat_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const firaCode = Fira_Code({ subsets: ["latin"], weight: ["400", "600"], preload: false });
const koNanumGothicCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    plexMono: plexMono.style.fontFamily,
    redhatMono: redhatMono.style.fontFamily,
    firaCode: firaCode.style.fontFamily,
  },
  ko: {
    plexMono: koNanumGothicCoding.style.fontFamily,
    redhatMono: koNanumGothicCoding.style.fontFamily,
    firaCode: koNanumGothicCoding.style.fontFamily,
  },
};
