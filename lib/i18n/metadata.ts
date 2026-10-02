import type { Metadata } from "next";
import { getLocale } from "./server";

// 탭 제목을 서버가 보는 사람의 언어로 정한다. 루트 레이아웃이 이미 getLocale()을 읽어 모든 화면이
// 매 요청 렌더라(2026-10-02) 정적 metadata + 마운트 뒤 바꿔치기(옛 LocalizedTitle)가 필요 없다 —
// 그 방식은 처음 내려오는 HTML·JS를 안 돌리는 로봇에겐 늘 한국어 제목이었다.
export async function localizedTitle(ko: string, en: string): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? en : ko };
}
