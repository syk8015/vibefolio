#!/usr/bin/env node
import { publishCommand } from "../src/publish.js";
import { saveToken, getOrigin } from "../src/config.js";

const HELP = `nookframe — 바이브코딩 작품을 한 줄로 Nookframe에 올리기

명령:
  publish            현재 폴더의 작품을 초안으로 올린다 (그 작품을 만든 AI가 메타데이터 작성)
    --url <url>        배포된 공개 URL (없으면 dist/out/build/public 자동 탐색)
                        서버·DB 필요해 그걸로 안 되면 공개 GitHub 저장소 URL도 가능(최후 수단, JS·파이썬 웹앱 자동 실행 / CLI·봇은 라이브 터미널 촬영)
    --app-url <url>    실제 앱 화면 URL (랜딩과 다를 때 — 시연은 이 주소를 촬영)
    --dir <path>       올릴 디렉터리 (정적 빌드 또는 파이썬·CLI 소스, 지정 시 zip 업로드)
    --title <t>        제목
    --description <t>  한 문단 설명
    --note <text>      공개 카드 말풍선에 뜨는 짧은 한마디 (builderNote)
    --hint <text>      시연 영상에서 보여줄 핵심 (demoHighlights)
    --access-url <u>   로그인 필요 앱의 데모/게스트 진입 URL·경로 (예 /demo)
    --access-params <q> 진입 URL에 붙일 쿼리 (예 "guest=1&lang=ko")
    --access-note <t>  데모 모드 보는 법 한두 문장 (계정 아이디/비번 금지 — 안 받음)
    --access-impossible  로그인·페어링 없이는 볼 방법이 원천 불가능한 앱 선언 (E2E 암호화 등)
                        이 경우 랜딩만 촬영되니 --video/--screenshot 동봉 권장, 이유는 --access-note에
    --screenshot <p>   썸네일용 스크린샷 이미지 (png/jpg/webp/gif, ≤5MB)
    --video <p>        직접 만든 시연 영상 (mp4/webm, ≤20MB — 주면 자동 촬영 생략)
    --json '<payload>' AI가 만든 전체 payload JSON (다른 플래그와 병합, JSON 우선)
    --origin <url>     API origin (기본 ${getOrigin()})
  rerecord <id>      영상이 마음에 안 들 때 — 다시 쓴 촬영 대본을 제출한다
                     (제출하면 대기 상태로 들어가고, 주인이 대시보드에서 확인하고 [재촬영]을 눌러야 반영됨)
    --json '<json>'    새 대본 JSON — { "steps": [...] } 또는 { "demoScript": {...}, "note": "..." }
    --file <path>      같은 JSON을 파일에서 읽기
    --note <text>      무엇을 왜 바꿨는지 한 줄
  drafts             내 초안 목록 (같은 URL로 publish를 다시 실행하면 새 초안 대신 기존 초안이 갱신됨)
    update <id>        초안 메타데이터 수정 (--title/--description/--note/--hint/--json — URL·파일 교체는 publish 재실행)
    delete <id>        초안 삭제 (공개된 프로젝트는 이 명령으로 못 지움)
  login <token>      토큰을 ~/.nookframe/config.json 에 저장
  mcp                MCP stdio 서버 실행 (클로드 데스크탑·커서 등에서 사용)

토큰 발급: nookframe.com/dashboard → 연결 탭. 발급 후 NOOKFRAME_TOKEN 환경변수 또는 login.`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      // 같은 플래그를 두 번 주면 조용히 마지막 값만 남던 문제(피드백 B-1):
      // 덮어쓰기 전에 경고한다. --screenshot 2장 같은 조용한 유실 방지.
      if (key in out) {
        console.error(`⚠️ --${key} 플래그가 여러 번 왔어요 — 마지막 값만 사용해요.`);
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

// 어느 서브커맨드에서든 --help/-h는 실행 대신 도움말(피드백 B-2 — 예전엔
// `publish --help`가 도움말 없이 업로드를 시도했다).
if (args.help || args.h || args._.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

try {
  switch (cmd) {
    case "publish":
      await publishCommand(args);
      break;
    case "rerecord": {
      const { rerecordCommand } = await import("../src/rerecord.js");
      await rerecordCommand(args);
      break;
    }
    case "drafts": {
      const { draftsCommand } = await import("../src/drafts.js");
      await draftsCommand(args);
      break;
    }
    case "login": {
      const token = args._[0] || (typeof args.token === "string" ? args.token : null);
      if (!token) {
        console.error("사용법: npx nookframe login <token>  (토큰은 nookframe.com/dashboard → 연결 탭)");
        process.exit(1);
      }
      saveToken(token);
      console.log("✓ 토큰을 저장했어요 (~/.nookframe/config.json).");
      break;
    }
    case "mcp": {
      const { runMcp } = await import("../src/mcp.js");
      await runMcp();
      break;
    }
    case "help":
    case undefined:
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    default:
      console.error(`알 수 없는 명령: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
