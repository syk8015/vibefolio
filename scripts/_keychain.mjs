// macOS 키체인 읽기/쓰기 원시 함수 — `_secrets.mjs`와 local-runner가 같이 쓴다.
//
// 왜 따로 뺐나: `_secrets.mjs`는 임포트되는 순간 `loadSecrets()`를 돌리고, 관리 대상
// 비밀값이 하나라도 없으면 `process.exit(1)` 한다. 앱 스크립트에는 옳은 동작이지만
// 상주 데몬(dispatch)이 그걸 임포트하면 무관한 키 하나 때문에 데몬이 죽는다.
// 그래서 "키체인을 쓰는 방법"만 이 파일로 내리고, `_secrets.mjs`는 이걸 가져다 쓴다.
// 즉 비밀값 저장소는 한 곳(맥 키체인)이고 구현도 한 벌이다.
//
// ⚠️ 한계는 `_secrets.mjs` 주석과 동일 — 같은 사용자로 도는 프로세스면 무엇이든 읽는다.
//    막아지는 것은 "평문 파일이 통째로 복사돼 나가는" 경로뿐이다.
import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";

export function readKeychain(service, account = userInfo().username) {
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-a", account, "-s", service, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const v = out.replace(/\n$/, "");
    return v.length > 0 ? v : null;
  } catch {
    return null; // 항목 없음 · 사용자 취소 · 잠긴 키체인
  }
}

// 값을 argv로 넘기지 않는다 — `security -i`가 stdin에서 명령을 읽어 같은 프로세스에서
// 실행하므로 `ps`에 값이 뜨지 않는다. (대화형 `-w` 프롬프트는 128바이트에서 잘려 못 쓴다.)
export function writeKeychain(service, value, account = userInfo().username) {
  if (typeof value !== "string" || value.length === 0) throw new Error("빈 값은 저장하지 않는다");
  if (/[\n\r]/.test(value)) throw new Error("줄바꿈이 든 값은 저장할 수 없다");
  try {
    execFileSync("security", ["-i"], {
      input: `add-generic-password -U -a ${account} -s ${service} -w ${value}\n`,
      stdio: ["pipe", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}
