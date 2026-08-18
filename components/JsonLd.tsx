// schema.org 구조화 데이터. 화면에 아무것도 그리지 않는 <script> 태그라
// 레이아웃에 영향이 없다 (명함 페이지 PC 레이아웃 불변식과 무관).
//
// 프로필 이름·소개글은 유저가 쓰는 값이고 그게 <script> 안으로 들어간다.
// "</script>"가 들어간 bio 하나면 태그를 탈출해 임의 마크업을 넣을 수 있으므로
// '<' 문자를 \u003c 로 이스케이프한다 — JSON 의미는 그대로다.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
