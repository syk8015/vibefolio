// 소개 영상 틀을 초안에 박아 둔다(2026-10-08) — 서버(인제스트·초안 수정)만 쓴다.
//
// 왜: 틀을 안 고른 영상은 재생할 때마다 작품 id로 추천 틀을 골랐다. 그러면 같은 주인의 두 작품이 같은 틀에
// 떨어질 수 있고(추천이 주인의 다른 작품을 몰랐다), AI가 대본을 다시 올리면 주인이 고른 틀이 지워졌다.
// 그래서 대본이 저장될 때 틀을 정해 같이 저장한다. 순서: 이번에 보낸 틀(주인이 검토 창에서 고른 것) →
// 이미 저장된 틀 → 주인의 다른 작품이 안 쓴 틀 중 추천. 검토 창·명함·영상 파일이 모두 저장된 틀을 쓴다.
import type { createAdminClient } from "@/lib/supabase/admin";
import { GENRE_IDS, recommendGenre, type GenreId } from "./genres/ids";
import type { IntroFilm } from "./schema";

type Admin = ReturnType<typeof createAdminClient>;

const asGenre = (v: unknown): GenreId | undefined =>
  typeof v === "string" && (GENRE_IDS as readonly string[]).includes(v) ? (v as GenreId) : undefined;

/**
 * film에 틀을 채워 돌려준다.
 * @param projectId 이미 있는 행이면 그 id(추천 씨앗·자기 자신 빼기), 새 행이면 null.
 * @param seed 새 행일 때 추천 씨앗(id가 아직 없다) — 제목 등.
 * @param stored 지금 저장된 intro_film(없으면 null).
 */
export async function assignGenre(
  admin: Admin, userId: string, film: IntroFilm, projectId: string | null, seed: string, stored: unknown,
): Promise<IntroFilm> {
  const chosen = asGenre(film.genre) ?? asGenre((stored as { genre?: unknown } | null)?.genre);
  if (chosen) return { ...film, genre: chosen };
  // 틀 없이 저장돼 있던 옛 대본(10-08 전) — 검토 창이 지금 보여 주는 추천(작품 id만 본 것)을 그대로 박는다.
  // 여기서 다른 틀을 고르면 주인이 보던 영상이 저장하는 순간 바뀐다.
  if (stored != null && projectId) return { ...film, genre: recommendGenre(projectId) };
  const { data } = await admin.from("projects").select("id, intro_film").eq("user_id", userId).not("intro_film", "is", null);
  const used = (data ?? [])
    .filter((r) => r.id !== projectId)
    .map((r) => asGenre((r.intro_film as { genre?: unknown } | null)?.genre) ?? recommendGenre(r.id as string));
  return { ...film, genre: recommendGenre(projectId ?? seed, used) };
}
