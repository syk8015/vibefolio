// 설명서 생성기 — `schema/publish.json` 한 장에서 배포 대상들을 만든다(2026-09-17 사용자 확정).
//
// 왜: 발행 payload의 필드·규칙 설명이 여러 벌로 갈라지면 "검사에선 통과라더니 발행에선
// 거절"이 생긴다. cli/는 독립 배포 패키지라 레포 코드를 import할 수 없어(AGENTS.md)
// 사본 자체는 피할 수 없다 — 대신 **손으로 만들지 않게** 해서 갈라질 수 없게 한다.
//
// 지금 만드는 것:
//   cli/src/schema.js — npm 배포(`nookframe schema`와 stdio MCP가 읽음)
//   lib/mcpTools.ts   — 원격 MCP(app/api/mcp)가 tools/list로 내보내는 정의
// 앞으로 붙을 것: public/openapi.json(ChatGPT 도우미).
//
// 두 통로가 갈라지는 지점은 **파일뿐**이다: CLI는 사람 컴퓨터에서 도니까 로컬 경로
// (dir·screenshot·video)를 받지만, 원격 MCP는 채팅 AI가 우리 서버로 부르는 것이라
// 그 경로가 가리킬 파일이 없다. 그래서 localOnlyFields는 원격 스키마에서 빼고,
// 설명은 {{FILES}}·{{MEDIA}} 자리에만 변종 문장을 채운다 — 본문은 끝까지 한 벌이다.
//
// 사용: `npm run schema:build` — 그리고 `npm test`의 드리프트 프로브가 생성물이
// 원본과 어긋났는지(= 누가 생성물을 손으로 고쳤는지) 검사한다.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AI_TOOLS, CONTENT_TYPES, TARGET_DEVICES } from "../lib/projectTaxonomy";
import { DEMO_SCRIPT_ACTIONS } from "../lib/demoScript";

const ROOT = join(import.meta.dirname, "..");
const SOURCE = join(ROOT, "schema/publish.json");

// 생성기가 채우는 목록 — 예전엔 cli/src/schema.js 안의 손동기화 사본이었다.
// 서버 목록이 바뀌면 여기를 거쳐 자동으로 따라간다.
const TAXONOMY: Record<string, readonly string[]> = {
  aiToolIds: AI_TOOLS.map((t) => t.id),
  contentTypes: CONTENT_TYPES.map((c) => c.id),
  targetDevices: [...TARGET_DEVICES],
  demoScriptActions: [...DEMO_SCRIPT_ACTIONS],
};

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** `{"$taxonomy":"x"}` → 목록, `{"$use":"y"}` → fields.y 를 펼친 값. 재귀. */
function resolve(node: Json, fields: Record<string, Json>, seen: string[] = []): Json {
  if (Array.isArray(node)) return node.map((n) => resolve(n, fields, seen));
  if (!node || typeof node !== "object") return node;

  const keys = Object.keys(node);
  if (keys.length === 1 && keys[0] === "$taxonomy") {
    const name = String(node.$taxonomy);
    const list = TAXONOMY[name];
    if (!list) throw new Error(`$taxonomy "${name}" 없음 — TAXONOMY에 추가하세요`);
    return [...list];
  }
  if (keys.length === 1 && keys[0] === "$use") {
    const name = String(node.$use);
    if (seen.includes(name)) throw new Error(`$use 순환: ${[...seen, name].join(" → ")}`);
    const target = fields[name];
    if (target === undefined) throw new Error(`$use "${name}" 없음 — fields에 추가하세요`);
    return resolve(target, fields, [...seen, name]);
  }
  // `{ "properties": { "$use": "x" } }` 처럼 값 자리에 섞여 있는 경우도 위 분기가 받는다.
  const out: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(node)) out[k] = resolve(v, fields, seen);
  return out;
}

/** 설명서를 받아 가는 통로. 지금은 둘 — 셸 있는 AI(cli)와 채팅창 AI(remote). */
type Variant = "cli" | "remote";

const src = JSON.parse(readFileSync(SOURCE, "utf8")) as {
  fields: Record<string, Json>;
  publishDescription: string;
  publishInput: Json;
  /** 원격 스키마에서 빼는 필드(로컬 파일 경로) — 채팅 AI에겐 가리킬 파일이 없다. */
  localOnlyFields: string[];
  /** `{{NAME}}` 자리에 통로별로 들어갈 문장. 본문은 갈라지지 않는다. */
  descriptionFills: Record<Variant, Record<string, string>>;
  tools: { name: string; description?: string; descriptionRef?: string; inputSchema: Json }[];
};

// `$use`가 가리킬 수 있는 것 = fields + 최상위 publishInput(툴 셋이 이걸 그대로 쓴다).
const fields: Record<string, Json> = { ...src.fields, publishInput: src.publishInput };
const lit = (v: Json) => JSON.stringify(v, null, 2);

const targetDevice = resolve(fields.targetDevice, fields);
const demoScript = resolve(fields.demoScript, fields);
const demoAccessProperties = resolve(fields.demoAccessProperties, fields);
const demoAccess = resolve(fields.demoAccess, fields);
const publishInput = resolve(src.publishInput, fields);

/** `{{NAME}}` 자리표시를 통로별 문장으로 채운다. 채울 문장이 없으면 즉시 실패 —
 *  자리표시가 그대로 남은 설명이 npm에 발행되면 AI가 그 문장을 읽는다. */
function fillDescription(variant: Variant): string {
  const fills = src.descriptionFills[variant];
  return src.publishDescription.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const text = fills?.[name];
    if (text === undefined) throw new Error(`descriptionFills.${variant}.${name} 없음 — publish.json에 추가하세요`);
    return text;
  });
}

// 원격 변종의 입력 스키마 = 로컬 경로 필드를 뺀 publishInput. 빼는 이름이 실제로
// 있는지 확인한다 — 오타로 조용히 안 빠지면 채팅 AI가 못 쓰는 필드를 보게 된다.
const publishInputRemote: Json = (() => {
  const input = JSON.parse(JSON.stringify(publishInput)) as { properties: Record<string, Json> };
  for (const name of src.localOnlyFields) {
    if (!(name in input.properties)) throw new Error(`localOnlyFields "${name}"가 publishInput에 없습니다`);
    delete input.properties[name];
  }
  return input as unknown as Json;
})();

// 갈리는 것은 publishInput 하나뿐 — 나머지 툴은 두 통로가 글자 그대로 같다.
const toolsFor = (variant: Variant) =>
  src.tools.map((t) => ({
    name: t.name,
    description: t.descriptionRef ? fillDescription(variant) : t.description!,
    inputSchema: resolve(
      t.inputSchema,
      variant === "remote" ? { ...fields, publishInput: publishInputRemote } : fields,
    ),
  }));

const tools = toolsFor("cli");

// cli/src/schema.js — 지금의 export 이름을 그대로 유지한다(mcp.js·check.js·publish.js가 읽는다).
const cli = `// 생성된 파일입니다 — 직접 고치지 마세요.
// 원본: schema/publish.json · 생성: npm run schema:build (scripts/build-schema.mts)
// 손으로 고치면 npm test의 schema-drift 프로브가 막습니다.
//
// 발행 payload 스키마 한 출처. MCP 서버(mcp.js)의 툴 입력 스키마와 \`nookframe schema\`
// 명령이 둘 다 여기서 읽는다. 목록(AI 도구·분류·대상 화면·대본 액션)은 생성 시점에
// 서버 lib/projectTaxonomy.ts·lib/demoScript.ts에서 읽어 박는다 — 옛 손동기화 사본 제거.

export const AI_TOOL_IDS = ${lit([...TAXONOMY.aiToolIds])};

export const CONTENT_TYPES = ${lit([...TAXONOMY.contentTypes])};

export const TARGET_DEVICE_SCHEMA = ${lit(targetDevice)};

export const DEMO_SCRIPT_SCHEMA = ${lit(demoScript)};

export const DEMO_ACCESS_PROPERTIES = ${lit(demoAccessProperties)};

export const DEMO_ACCESS_SCHEMA = ${lit(demoAccess)};

export const PUBLISH_DESCRIPTION = ${lit(fillDescription("cli"))};

export const PUBLISH_INPUT_SCHEMA = ${lit(publishInput)};

// MCP 툴 정의 전부 — 예전엔 mcp.js 안에 손으로 적혀 있었다.
export const TOOLS = ${lit(tools as unknown as Json)};

// \`nookframe schema\` 출력 — 표준 JSON Schema 문서. 규칙 설명(description)까지 실어야
// CLI로 올리는 AI도 MCP 툴 설명과 같은 안내를 본다.
export function publishPayloadSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Nookframe publish payload",
    description: PUBLISH_DESCRIPTION,
    ...PUBLISH_INPUT_SCHEMA,
  };
}
`;

// lib/mcpTools.ts — 원격 MCP(app/api/mcp)가 내보내는 툴 정의. 서버 코드라 TS다.
const remote = `// 생성된 파일입니다 — 직접 고치지 마세요.
// 원본: schema/publish.json · 생성: npm run schema:build (scripts/build-schema.mts)
// 손으로 고치면 npm test의 schema-drift 프로브가 막습니다.
//
// 원격 MCP 서버(app/api/mcp)가 tools/list로 내보내는 툴 정의. 셸이 있는 AI가 보는
// stdio 쪽(cli/src/schema.js의 TOOLS)과 **같은 원본**에서 나온다 — 두 통로가 같은
// 설명을 보게 하는 것이 이 생성기의 존재 이유다. 다른 점은 로컬 경로 필드
// (${src.localOnlyFields.join(" · ")})가 없다는 것뿐: 원격 호출자에겐 우리 서버에 파일이 없다.

export type McpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export const MCP_TOOLS: McpTool[] = ${lit(toolsFor("remote") as unknown as Json)};

/** tools/call이 받아주는 이름 전부 — 목록 밖 이름은 서버가 거절한다. */
export const MCP_TOOL_NAMES: string[] = MCP_TOOLS.map((t) => t.name);
`;

export const GENERATED = { "cli/src/schema.js": cli, "lib/mcpTools.ts": remote };

// 직접 실행이면 파일로 쓴다. 드리프트 프로브는 import만 해서 내용을 비교한다(쓰지 않음).
if (process.argv[1]?.endsWith("build-schema.mts")) {
  for (const [rel, content] of Object.entries(GENERATED)) {
    writeFileSync(join(ROOT, rel), content);
    console.log(`✓ ${rel} (${content.length}자)`);
  }
}
