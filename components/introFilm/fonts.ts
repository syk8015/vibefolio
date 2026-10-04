// 영상 틀 글꼴 — next/font가 우리 서버에서 내려준다(구글에 요청하지 않음). 미리보기·명함·워커 렌더가 같은 파일을 쓰므로
// 글자 폭이 같다. 틀은 논리 이름(redhatMono…)만 알고, 여기서 next/font가 붙인 실제 CSS 이름으로 바꿔 넘긴다.
// 한국어 판이면 모든 글꼴 뒤에 한글 고정폭 글꼴이 붙는다(캔버스는 글자마다 다음 글꼴로 넘어간다).
import { Chakra_Petch, Fira_Code, IBM_Plex_Mono, Nanum_Gothic_Coding, Red_Hat_Mono } from "next/font/google";

const redhatMono = Red_Hat_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], preload: false });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], preload: false });
const firaCode = Fira_Code({ subsets: ["latin"], weight: ["400", "600"], preload: false });
const chakraPetch = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600"], preload: false });
const nanumCoding = Nanum_Gothic_Coding({ weight: ["400", "700"], preload: false });

const FAMILY: Record<string, string> = {
  redhatMono: redhatMono.style.fontFamily,
  plexMono: plexMono.style.fontFamily,
  firaCode: firaCode.style.fontFamily,
  chakraPetch: chakraPetch.style.fontFamily,
  pixelKo: nanumCoding.style.fontFamily,
};
const KO = nanumCoding.style.fontFamily;
/** 틀이 스스로 그리는 한국어 표시(예시 도장·출처 등) — 대본에 없는 글자라 따로 받아 둔다. "한"은 LCD가 한글 칸 맞추는 기준 글자. */
const GENRE_KO_LABELS = "예시 값 자료 실제 계정 아님 숫자는 다를 수 있음 알림 단위 사용 남음 출처 한";

/** 논리 이름 → 캔버스 font-family 목록(한국어 판이면 한글 글꼴이 뒤에). */
export function genreFonts(keys: readonly string[], locale: "en" | "ko"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of [...keys, "pixelKo"]) {
    const base = FAMILY[k] ?? "monospace";
    out[k] = locale === "ko" && k !== "pixelKo" ? `${base}, ${KO}` : base;
  }
  return out;
}

/**
 * 그리기 전에 글꼴을 다 받는다(글자 폭을 재서 배치하므로). 3초가 지나면 있는 대로 그린다.
 * text = 영상에 나올 글자 전부 — 한글 글꼴은 글자 묶음(unicode-range)별로 나뉘어 있어서, 견본 몇 자만 받으면
 * 나머지 글자는 대체 글꼴로 재져 간격이 틀린다(10-02 교훈).
 */
export async function loadGenreFonts(keys: readonly string[], locale: "en" | "ko", text = ""): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const sample = "Aa0" + text.replace(/[\x00-\x7f]/g, "") + (locale === "ko" ? GENRE_KO_LABELS : "");
  const specs: string[] = [];
  for (const k of keys) for (const w of [400, 500, 600, 700]) specs.push(`${w} 40px ${FAMILY[k] ?? "monospace"}`);
  if (locale === "ko") for (const w of [400, 700]) specs.push(`${w} 40px ${KO}`);
  const all = Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => [])));
  await Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}
