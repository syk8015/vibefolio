// 운영 스크립트용 비밀값 주입 — 키체인 우선 · .env 파일 폴백 (2026-09-01).
//
// 왜: 워커에서 서비스롤 키를 걷어낸 뒤(`b229a85`+`e281c58`)에도 이 맥의
// `.env.local` 평문에 `SUPABASE_SERVICE_ROLE_KEY` 한 줄이 남아 있었다. 사람이
// 손으로 돌리는 도구라 상시 노출은 아니지만, 백업·실수 커밋·디스크 이미지로
// 새는 경로는 워커와 똑같다. 그래서 값을 macOS 키체인으로 옮기고 파일에서 지운다.
//
// ⚠️ 한계 — 이건 격리가 아니다. 키체인 항목은 **같은 사용자로 도는 프로세스라면
// 무엇이든** `security find-generic-password -w` 한 줄로 읽어낼 수 있다(로그인
// 세션이 열려 있는 동안 잠금 해제 상태). 막아지는 것은 "평문 파일이 통째로
// 복사돼 나가는" 경로뿐이고, 이 맥에서 이미 도는 악성 코드는 못 막는다.
//
// 쓰는 법 — 스크립트 첫 줄에 `import "./_secrets.mjs";` (부수효과 임포트).
//   ESM은 임포트를 본문보다 먼저 실행하므로 이 줄이 맨 위에 있으면 클라이언트
//   생성 시점엔 process.env가 이미 채워져 있다.
// 명령 앞에 붙이는 용도(로컬 dev 등) — `node scripts/_secrets.mjs next dev`
//
// 키 심기 — `security -i`는 stdin에서 명령을 읽어 **같은 프로세스 안에서** 실행하므로
// 값이 별도 프로세스의 argv(=`ps`)에 뜨지 않는다:
//   printf 'add-generic-password -U -a %s -s %s -w %s\n' \
//     "$USER" nookframe-supabase-service-role "$KEY" | security -i
// ⚠️ `... -w` 를 인자 없이 두고 stdin으로 값을 흘리는 방법은 쓰지 말 것 — 그 대화형
//    프롬프트는 **128바이트에서 값을 잘라 먹는다**(서비스롤 JWT는 219자라 조용히 깨짐).
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { userInfo } from "node:os";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUIET = process.env.NF_SECRETS_QUIET === "1";

// 키체인에 사는 비밀값. 이름을 늘릴 땐 여기에만 추가한다.
const MANAGED = [
  { env: "SUPABASE_SERVICE_ROLE_KEY", service: "nookframe-supabase-service-role" },
];

function loadEnvFiles() {
  // 레포 루트 기준 → CWD 기준 순. 어디서 실행하든 같은 파일을 집는다.
  for (const rel of [".env.local", ".env"]) {
    for (const base of [REPO_ROOT, process.cwd()]) {
      try {
        process.loadEnvFile(join(base, rel));
        break; // 같은 이름은 한 번만
      } catch {
        /* 없으면 다음 후보 */
      }
    }
  }
}

function readKeychain(service) {
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-a", userInfo().username, "-s", service, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const v = out.replace(/\n$/, "");
    return v.length > 0 ? v : null;
  } catch {
    return null; // 항목 없음 · 사용자 취소 · 잠긴 키체인
  }
}

export function loadSecrets() {
  loadEnvFiles();
  for (const { env, service } of MANAGED) {
    const fromKeychain = readKeychain(service);
    if (fromKeychain) {
      process.env[env] = fromKeychain; // 키체인 우선 — 파일 값이 있어도 덮는다
      if (!QUIET) console.error(`[secrets] ${env} ← 키체인 (${service})`);
      continue;
    }
    if (process.env[env]) {
      if (!QUIET) console.error(`[secrets] ${env} ← .env 파일 (폴백)`);
      continue;
    }
    console.error(
      `[secrets] ✗ ${env} 를 어디서도 못 찾았어요.\n` +
        `  키체인에 심으려면 (security -i 라서 값이 ps에 안 뜹니다):\n` +
        `    printf 'add-generic-password -U -a %s -s %s -w %s\\n' \\\n` +
        `      "$USER" ${service} "$KEY" | security -i\n` +
        `  확인: security find-generic-password -s ${service} -w`,
    );
    process.exit(1);
  }
}

loadSecrets();

// 명령 앞에 붙는 러너로 직접 실행됐을 때만 자식 프로세스를 띄운다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    console.error("사용: node scripts/_secrets.mjs <명령> [인자...]");
    process.exit(2);
  }
  const child = spawn(cmd, rest, { stdio: "inherit", env: process.env });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => child.kill(sig));
  }
  child.on("error", (e) => {
    console.error(`[secrets] ${cmd} 실행 실패: ${e.message}`);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}
