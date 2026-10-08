// 영상 틀 'ticketstub'의 글꼴 — 이 틀을 고른 영상에서만 불러온다(재생기가 import()로 늦게 받는다).
// 글꼴 파일은 next/font가 우리 서버에서 내려준다. ko = 한국어 판에서 그 글꼴 뒤에 붙는 한글 글꼴.
import { Do_Hyeon, League_Gothic, Nanum_Myeongjo, Zilla_Slab } from "next/font/google";
import type { FaceSet } from "../fonts";

const leagueGothic = League_Gothic({ subsets: ["latin"], weight: ["400"], preload: false });
const zillaSlab = Zilla_Slab({ subsets: ["latin"], weight: ["400", "500", "700"], preload: false });
const koDoHyeon = Do_Hyeon({ weight: ["400"], preload: false });
const koNanumMyeongjo = Nanum_Myeongjo({ weight: ["400", "700"], preload: false });

export const faces: FaceSet = {
  family: {
    leagueGothic: leagueGothic.style.fontFamily,
    zillaSlab: zillaSlab.style.fontFamily,
  },
  ko: {
    leagueGothic: koDoHyeon.style.fontFamily,
    zillaSlab: koNanumMyeongjo.style.fontFamily,
  },
};
