# nookframe

바이브코딩 작품을 **한 줄로** [Nookframe](https://nookframe.com)에 올리는 CLI + MCP 서버.
당신의 프로젝트를 **만든 AI**가 레포를 읽고 설명·의도·**촬영 대본**을 대신 작성해 올려줍니다.

## 빠른 시작

1. `nookframe.com/dashboard → 연결` 탭에서 토큰을 발급하고 환경변수로 넣으세요:
   ```bash
   export NOOKFRAME_TOKEN="nf_live_..."   # 또는: npx nookframe login <token>
   ```
2. 프로젝트를 만든 AI(클로드코드·커서 등)에게 말하세요: **"이거 Nookframe에 올려줘"**
   AI가 메타데이터를 작성하고 아래를 실행합니다:
   ```bash
   npx nookframe publish --json '<AI가 만든 payload>'
   ```

## 명령

```
nookframe publish            현재 폴더 작품을 초안으로 올림
  --url <url>                배포된 공개 URL (없으면 dist/out/build/public 자동 탐색)
                             공개 GitHub 저장소 URL도 가능 — JS·파이썬 웹앱은 자동 실행, CLI·봇은 라이브 터미널 촬영
  --app-url <url>            실제 앱 화면 URL (랜딩과 다를 때 — 시연은 이 주소를 촬영)
  --dir <path>              올릴 디렉터리 (정적 빌드 또는 파이썬·CLI 소스, zip 업로드)
  --title <t>               제목
  --hint <text>             시연 영상에서 보여줄 핵심 (demoHighlights) — 촬영 대본은 --json의 demoScript로
  --access-url <u>          로그인 필요 앱의 데모/게스트 진입 URL·경로 (예 /demo)
  --access-params <q>       진입 URL에 붙일 쿼리 (예 "guest=1&lang=ko")
  --access-note <t>         데모 모드 보는 법 한두 문장 (계정 정보는 안 받음)
  --screenshot <p>          썸네일용 스크린샷 (png/jpg/webp/gif ≤5MB)
  --video <p>               직접 만든 시연 영상 (mp4/webm ≤20MB — 주면 자동 촬영 생략)
  --json '<payload>'        AI가 만든 전체 payload JSON
  --origin <url>            API origin (기본 https://nookframe.com)
nookframe drafts             내 초안 목록
nookframe drafts update <id>  초안 메타데이터 수정 (--title/--description/--note/--hint/--json)
nookframe drafts delete <id>  초안 삭제 (공개된 프로젝트는 못 지움)
nookframe login <token>      토큰 저장 (~/.nookframe/config.json)
nookframe mcp                MCP stdio 서버 실행
```

## 촬영 대본 (demoScript)

공개하면 로봇이 앱을 직접 조작해 시연 영상을 찍습니다. **로봇이 픽셀만 보고 추측하게 두지 말고**,
만든 AI가 `--json` payload에 `demoScript`를 넣어주세요. 이 대본이 곧 영상 전체입니다.

```json
{
  "title": "Todo Sketch",
  "demoScript": {
    "steps": [
      { "goal": "할 일 추가가 핵심", "selector": "#new-todo", "action": "type", "text": "장보기", "expect": "목록에 항목 추가" },
      { "goal": "드래그로 순서 바꾸기", "selector": ".todo:first-child", "toSelector": ".todo:last-child", "action": "drag", "hold": 2 },
      { "goal": "완료 통계 강조", "selector": ".stats", "action": "focus" }
    ],
    "skip": ["다크 모드 토글"]
  }
}
```

- **5~8스텝 적정(최대 10), 중요한 순서대로** — 필름은 ~30초라 뒤부터 잘립니다.
- `selector`(CSS 셀렉터)를 **모든 스텝에 주면** 로봇이 화면을 탐색하지 않고 DOM에서 바로 조립합니다 — 더 빠르고 정확.
- `action`: `click` · `type` · `drag` · `scroll` · `hover` · `draw` · `focus`(조작 없이 그 영역을 카메라가 확대).
- `hold`(0.5~4초): 천천히 봐야 하는 스텝의 결과를 그만큼 더 보여줍니다.
- 대본에 있어도 로봇은 **로그인·제출·삭제·파일 선택은 누르지 않습니다.**

올린 작품은 **초안**으로 들어가며, 대시보드에서 확인·수정 후 공개하면 자동 시연 영상이 촬영됩니다.
같은 URL로 `publish`를 다시 실행하면 새 초안이 생기지 않고 **기존 초안이 갱신**됩니다.

## MCP (클로드 데스크탑 · 커서)

```json
{
  "mcpServers": {
    "nookframe": {
      "command": "npx",
      "args": ["-y", "nookframe", "mcp"],
      "env": { "NOOKFRAME_TOKEN": "nf_live_..." }
    }
  }
}
```

툴 `publish_to_nookframe` · `list_nookframe_drafts` · `update_nookframe_draft` · `delete_nookframe_draft` 가 노출됩니다.
`publish_to_nookframe`·`update_nookframe_draft` 둘 다 위 `demoScript` 스키마를 그대로 받습니다.
