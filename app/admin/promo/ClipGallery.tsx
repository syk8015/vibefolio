import ClipCard, { type ClipData } from "./ClipCard";

export type { ClipData };

// 클립 목록. 카드 한 장이 영상(208px)+캡션+채널 버튼이라 폭이 필요해서 최대
// 2열 — 예전 3열은 캡션 칸이 눌려서 못 쓴다.
export default function ClipGallery({ clips }: { clips: ClipData[] }) {
  if (clips.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        아직 촬영된 클립이 없어요. 위 태그라인 풀에서 몇 개 골라 큐에 추가한 뒤 `npm run promo:batch`를 돌려주세요.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} />
      ))}
    </div>
  );
}
