import { SECURITY_CONTACT, SECURITY_PAGE } from "@/lib/securityContact";

// /.well-known/security.txt (RFC 9116) — next.config.ts rewrites가 여기로 잇는다(점 폴더는 app/ 라우트가 안 됨).
// Expires는 1년 안이어야 해서 고정 날짜를 두지 않고 하루마다 다시 만든다(오늘 + 180일) — 손으로 갱신할 일이 없다.
export const revalidate = 86400;

export function GET() {
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  const body = [
    `Contact: mailto:${SECURITY_CONTACT}`,
    `Expires: ${expires.toISOString().replace(".000Z", "Z")}`,
    `Policy: ${SECURITY_PAGE}`,
    "Preferred-Languages: en, ko",
    "Canonical: https://nookframe.com/.well-known/security.txt",
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
