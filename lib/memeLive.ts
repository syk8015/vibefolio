// 매일 밈 5단계(2026-11-05) — 검토 화면(/admin/memes)에서 '공개'한 줄을 홈과 홍보 영상에 잇는다.
// 공개 칸은 오직 status='approved'. 고정 문구(lib/taglines.ts·lib/loggedInTaglines.ts)는 그대로 두고,
//   - 새 밈(kind=new)은 고정 문구에 더한다. 공개한 지 하루가 안 된 줄은 '오늘의 밈'으로 맨 앞에.
//   - 최신화(kind=refresh)는 바꿀 기존 문구(replaces)를 화면에서만 갈아 끼운다. 내리면 원래 문구가 돌아온다.
//     코드 속 문구에 접는 건 달마다 손으로(그때 그 줄은 내린다).
// meme_lines는 RLS로 막힌 표라 관리자 키로만 읽는다 — 그래서 여기서 쓰는 칸은 공개해도 되는 글뿐이다.
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loggedInTaglines, loggedInTaglinesEn, type LoggedInTagline } from "@/lib/loggedInTaglines";
import { EMPTY_LIVE, applyOverrides, shapeLiveMemes, type LiveMemes } from "@/lib/memeLiveShape";
import type { Locale } from "@/lib/i18n/config";

export const MEMES_TAG = "memes";

const readLive = unstable_cache(
  async (lang: Locale, nowBucket: number): Promise<LiveMemes> => {
    const { data, error } = await createAdminClient()
      .from("meme_lines")
      .select("text, reply, audience, kind, replaces, reviewed_at")
      .eq("lang", lang)
      .eq("status", "approved")
      .limit(500);
    if (error) throw error;
    return shapeLiveMemes(data ?? [], nowBucket);
  },
  ["meme-live"],
  { revalidate: 600, tags: [MEMES_TAG] },
);

/** 홈용. 읽기에 실패하면 고정 문구만으로 돈다(홈이 이것 때문에 깨지면 안 된다). */
export async function getLiveMemes(locale: Locale): Promise<LiveMemes> {
  try {
    // '하루 안' 판정이 캐시 안에서 굳지 않게 10분 단위 시각을 열쇠로 쓴다.
    const bucket = Math.floor(Date.now() / 600_000) * 600_000;
    return await readLive(locale, bucket);
  } catch (err) {
    console.error("[memeLive] read failed — static pools only", err);
    return EMPTY_LIVE;
  }
}

/**
 * 홍보 영상이 찍을 수 있는 문구 전체(로그인 홈 풀 기준): 고정 문구(최신화 반영) + 공개한 새 밈.
 * 촬영 대기열(/api/admin/promo/clips)·촬영 페이지(/promo-record)·문구 고르기 화면이 같은 목록을 본다 —
 * 대기열에 넣은 문구를 촬영 페이지가 못 찾으면 촬영이 실패한다.
 */
export async function getPromoPool(locale: Locale): Promise<LoggedInTagline[]> {
  const live = await getLiveMemes(locale);
  const base = applyOverrides(locale === "en" ? loggedInTaglinesEn : loggedInTaglines, live.overrides);
  const seen = new Set(base.map((l) => l.text));
  const extra = [...live.fresh, ...live.rest].filter((l) => !seen.has(l.text) && (seen.add(l.text), true));
  return [...base, ...extra];
}
