import AuthDoor from "@/components/auth/AuthDoor";
import { doorStart } from "@/components/auth/doorStart";

// /login과 /signup은 같은 문 하나(components/auth/AuthDoor, 2026-10-02) — 계정이 있는지 몰라도
// 이메일만 넣으면 된다. 첫 모습(?mode=password·?error=·지난번 방법)은 서버가 정한다.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <AuthDoor start={await doorStart(await searchParams)} />;
}
