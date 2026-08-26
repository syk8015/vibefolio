// 네이티브 폰·데스크톱 앱 판별 (2026-08-26, 유형 커버리지 — 수요 감지).
//
// 웹 타깃이 아예 없는 앱(Swift/SwiftUI, Kotlin/Compose, Unity)은 지금 구조로는
// 촬영할 방법이 없다 — 브라우저에 띄울 수 있는 게 없기 때문이다. Flutter·Expo·
// React Native는 웹 타깃이 있어 08-26부터 대신 빌드해 찍지만(build.ts
// detectWebBuild), 이 셋은 남는다.
//
// 그래서 지금 붙이는 건 **해결이 아니라 계측**이다: 클라우드 폰(Appetize 등)을
// 붙이려면 월 구독이 필요한데, 실제로 그런 작품을 올리려는 사람이 있는지부터
// 세어야 한다. 거절은 그대로 하되 (1) 왜 안 되는지 정확히 말해주고 (2)
// analytics_events에 `native_app_rejected`를 남겨 /admin에서 수요를 본다.
//
// 순수 함수(파일 경로 목록만 봄) — 인제스트의 zip 엔트리와 워커의 샌드박스
// 파일 목록이 같은 판정을 쓰도록 여기 한 곳에 둔다.

export type NativePlatform = "ios" | "android" | "unity";

export const NATIVE_PLATFORMS: readonly NativePlatform[] = ["ios", "android", "unity"];

export function isNativePlatform(v: unknown): v is NativePlatform {
  return typeof v === "string" && (NATIVE_PLATFORMS as readonly string[]).includes(v);
}

const UNITY_RE = /(^|\/)ProjectSettings\/ProjectVersion\.txt$|\.unity$|(^|\/)Assets\/.+\.meta$/i;
const IOS_RE = /(^|\/)project\.pbxproj$|\.xcodeproj\/|\.xcworkspace\/|(^|\/)Package\.swift$|\.swift$/i;
const ANDROID_RE = /(^|\/)AndroidManifest\.xml$|(^|\/)build\.gradle(\.kts)?$|(^|\/)settings\.gradle(\.kts)?$|\.kt$/i;

/**
 * 경로 목록에서 "웹 타깃 없는 네이티브 앱"의 흔적을 찾는다. 없으면 null.
 *
 * 호출 지점이 곧 전제다: **다른 모든 판정이 실패한 뒤에만** 부른다(zip은 앵커가
 * 없을 때, 워커는 not-a-webapp 직전). React Native/Expo 프로젝트도 android/·ios/
 * 폴더를 갖고 있지만, 그건 package.json 때문에 이 함수에 닿기 전에 갈린다.
 */
export function detectNativeApp(paths: string[]): NativePlatform | null {
  // Unity를 먼저 본다 — Unity 프로젝트도 안드로이드 빌드 설정을 품고 있어서
  // 순서를 바꾸면 전부 "안드로이드"로 뭉개진다.
  if (paths.some((p) => UNITY_RE.test(p))) return "unity";
  if (paths.some((p) => IOS_RE.test(p))) return "ios";
  if (paths.some((p) => ANDROID_RE.test(p))) return "android";
  return null;
}
