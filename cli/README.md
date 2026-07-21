# nookframe

바이브코딩 작품을 **한 줄로** [Nookframe](https://nookframe.com)에 올리는 CLI + MCP 서버.
당신의 프로젝트를 **만든 AI**가 레포를 읽고 설명·의도·시연 핵심포인트를 대신 작성해 올려줍니다.

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
  --dir <path>              올릴 정적 빌드 디렉터리 (zip 업로드)
  --title <t>               제목
  --hint <text>             시연 영상에서 보여줄 핵심 (demoHighlights)
  --json '<payload>'        AI가 만든 전체 payload JSON
  --origin <url>            API origin (기본 https://nookframe.com)
nookframe login <token>      토큰 저장 (~/.nookframe/config.json)
nookframe mcp                MCP stdio 서버 실행
```

올린 작품은 **초안**으로 들어가며, 대시보드에서 확인·수정 후 공개하면 자동 시연 영상이 촬영됩니다.

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

툴 `publish_to_nookframe` 가 노출됩니다.
