import ErrorState from "@/components/ErrorState";

// Branded 404 — /@username is a share unit, so mistyped/deleted handles hit this
// often. Renders inside the root layout, so the paper/ink tokens are available.
export default function NotFound() {
  return (
    <ErrorState
      eyebrow="404 · 페이지 없음"
      title="페이지를 찾을 수 없어요"
      description="주소가 바뀌었거나 사라진 페이지일 수 있어요. 홈으로 돌아가 시작해 주세요."
      homeLabel="홈으로"
      homeHref="/"
    />
  );
}
