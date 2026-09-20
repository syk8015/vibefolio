// 워커 프로필 — type enum이 허용 작업의 전부다. 각 프로필 = 프롬프트 빌더 하나.
//
// 2026-09-20 편입 때 **티어(T1/T2)를 없앴다.** 대상이 nookframe 하나로 고정되면서
// "이 워커는 어느 폴더까지 볼 수 있나"가 워커마다 다를 이유가 사라졌다. 이제 권한은
// `workerSettings()` 한 벌이고, 읽기 범위는 `project.readableDirs()`가 정한다.
//
// 🔴 Bash는 여전히 전 워커 금지다. 편입으로 풀린 게 아니다 —
//    "에이전트는 무엇을 만들지 정하고, 실행은 신뢰 코드(local-runner)가 한다"는 경계가
//    그대로 살아 있다. 빌드·촬영·인코딩·업로드는 local-runner 쪽에 붙인다.
import { projectContext, readableDirs } from './project.js';

const REPORT_RULE = `
## 산출물 규약
- 최종 결과를 이 폴더의 REPORT.md 파일에 한국어로 작성하라.
- 첫 줄은 "# <제목>", 둘째 줄은 한 문장 요약(푸시 알림에 그대로 실린다).
- 조사 근거(URL 등)는 문서 말미에 목록으로.
- **보고서 말고 따로 전달할 것이 있으면 이 폴더에 파일로 더 만들어라**(실행 목록, 캡션 묶음,
  슬라이드 HTML 등). 이 폴더에 남긴 파일은 REPORT.md와 함께 전부 outbox로 나간다.
  \`.claude/\`와 JOB.md만 제외된다.`;

export const WORKERS = {
  research: {
    build(job) {
      return [
        '당신은 자료조사 담당이다. 아래 주제를 웹서치로 조사하고 보고서를 작성하라.',
        projectContext(),
        `## 조사 주제\n${job.params.prompt}`,
        REPORT_RULE,
      ]
        .filter(Boolean)
        .join('\n\n');
    },
  },

  'site-monitor': {
    build(job) {
      return [
        '당신은 사이트 순찰 담당이다. 아래 사이트를 점검하라.',
        projectContext(),
        `## 점검 항목
- 접속 가능 여부(메인 + 주요 하위 페이지 몇 개)
- 눈에 띄는 오류(깨진 페이지, 에러 문구, 비정상 응답)
- 콘텐츠가 정상 렌더링되는지(WebFetch 결과 기준)
${job.params.prompt ? `\n## 이 잡에서 특별히 볼 것\n${job.params.prompt}` : ''}`,
        `## 조용히 깨지는 표면 — 200이면 정상으로 보면 놓친다
Sentry·Vercel은 셋 다 "200이면 정상"으로 봐서 못 잡는다. 응답 **본문의 키**를 봐라.
1. \`GET /api/oauth/meta/authorization-server\` → \`client_id_metadata_document_supported: true\`와
   \`token_endpoint_auth_methods_supported: ["none"]\`이 **둘 다** 있어야 한다.
2. \`POST /api/mcp\` 무인증 → 401 + \`WWW-Authenticate\` 헤더에 \`resource_metadata\` 포함.
3. \`/@<핸들>\` 공개 페이지 → 200 + 영상 태그 존재.`,
        REPORT_RULE,
        '이상이 없으면 요약 문장을 "정상 — "으로 시작하고, 이상이 있으면 "이상 — "으로 시작하라.',
      ]
        .filter(Boolean)
        .join('\n\n');
    },
  },

  'code-review': {
    // ⚠️ 이 워커는 반복(every)으로 걸지 말 것 — 이미 보류로 결정된 건을 매번 다시 올린다.
    //    주제가 있을 때 1회성(now/at)으로만 쓴다.
    build(job) {
      return [
        '당신은 코드 검수 담당이다. 아래 리포를 읽고(수정 금지) 개선점 보고서를 작성하라.',
        projectContext(),
        `## 요청\n${job.params.prompt || '전반적인 개선점(버그 위험, 단순화, 성능, 유지보수성) 위주로.'}`,
        REPORT_RULE,
        '개선점마다: 파일 경로·이유·제안을 명시하라. 우선순위(높음/중간/낮음)를 붙여라.',
      ]
        .filter(Boolean)
        .join('\n\n');
    },
  },
};

// 워크스페이스 .claude/settings.json + spawn 플래그의 원천.
// 허용: 웹 + 워크스페이스 내 읽기/쓰기 + 대상 폴더 읽기 전용. 거부: Bash.
export function workerSettings({ readDirs = readableDirs() } = {}) {
  const allow = ['WebSearch', 'WebFetch', 'Glob', 'Grep', 'Read(./**)', 'Write(./**)', 'Edit(./**)'];
  for (const d of readDirs) allow.push(`Read(//${String(d).replace(/^\//, '')}/**)`);
  // allow 목록에 없는 도구/경로는 -p 모드에서 자동 거부되므로,
  // deny는 Bash만 명시(이중 안전). Write/Edit는 allow의 ./** 스코프가 상한.
  return { permissions: { allow, deny: ['Bash'] } };
}
