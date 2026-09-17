// 프로젝트 분류 택소노미 — 콘텐츠 타입(8종)과 AI 툴 목록. 순수 데이터라 대시보드
// UI(클라)와 서버측 인제스트 검증이 함께 import한다. AI가 보낸 값을 우리가 아는
// id로 정규화하는 헬퍼도 여기 둔다(화이트리스트 = 쓰레기 태그/카테고리 차단).

export const CONTENT_TYPES = [
  { id: "web-app",   label: "웹 앱",        emoji: "🌐" },
  { id: "saas",      label: "SaaS",         emoji: "☁️" },
  { id: "mobile",    label: "모바일 앱",     emoji: "📱" },
  { id: "game",      label: "게임",          emoji: "🎮" },
  { id: "extension", label: "크롬 익스텐션", emoji: "🧩" },
  { id: "ai-service",label: "AI 서비스",     emoji: "🤖" },
  { id: "media",     label: "미디어 콘텐츠", emoji: "🎨" },
  { id: "other",     label: "기타",          emoji: "📦" },
];

export const AI_TOOLS = [
  { id: "ChatGPT"          },
  // 채팅창 Claude(2026-09-17 추가). 원격 MCP로 올리는 사람은 대개 이쪽이고, 예전엔
  // "Claude Code"뿐이라 태그를 비우고 올리는 일이 생겼다. 대조는 소문자 정확 일치라
  // "claude"와 "claude code"는 서로 다른 키다 — 충돌하지 않는다.
  { id: "Claude"           },
  { id: "Claude Code"      },
  { id: "Cursor"           },
  { id: "GitHub Copilot"   },
  { id: "Gemini"           },
  { id: "v0"               },
  { id: "Bolt.new"         },
  { id: "Windsurf"         },
  { id: "Lovable"          },
  { id: "Replit AI"        },
  { id: "Devin"            },
  { id: "Aider"            },
  { id: "Continue.dev"     },
  { id: "Codeium"          },
  { id: "Amazon Q"         },
  { id: "Perplexity"       },
  { id: "Midjourney"       },
  { id: "DALL-E"           },
  { id: "Stable Diffusion" },
  { id: "Ideogram"         },
  { id: "Flux"             },
  { id: "Runway"           },
  { id: "Kling"            },
  { id: "Pika"             },
  { id: "Suno"             },
  { id: "ElevenLabs"       },
];

export const AI_TOOL_DOMAINS: Record<string, string> = {
  "ChatGPT":           "chatgpt.com",
  "Claude Code":       "claude.ai",
  "Cursor":            "cursor.com",
  "GitHub Copilot":    "github.com",
  "Gemini":            "gemini.google.com",
  "v0":                "v0.dev",
  "Bolt.new":          "bolt.new",
  "Windsurf":          "windsurf.com",
  "Lovable":           "lovable.dev",
  "Replit AI":         "replit.com",
  "Devin":             "cognition.ai",
  "Aider":             "aider.chat",
  "Continue.dev":      "continue.dev",
  "Codeium":           "codeium.com",
  "Amazon Q":          "aws.amazon.com",
  "Perplexity":        "perplexity.ai",
  "Midjourney":        "midjourney.com",
  "DALL-E":            "openai.com",
  "Stable Diffusion":  "stability.ai",
  "Ideogram":          "ideogram.ai",
  "Flux":              "blackforestlabs.ai",
  "Runway":            "runwayml.com",
  "Kling":             "klingai.com",
  "Pika":              "pika.art",
  "Suno":              "suno.com",
  "ElevenLabs":        "elevenlabs.io",
};

export const CONTENT_TYPE_IDS = new Set(CONTENT_TYPES.map((c) => c.id));

/** AI가 보낸 태그를 우리가 아는 AI 툴 id로만 정규화(대소문자 무시). 나머지 버림. */
export function normalizeTags(tags: unknown, max = 10): string[] {
  if (!Array.isArray(tags)) return [];
  const byLower = new Map(AI_TOOLS.map((t) => [t.id.toLowerCase(), t.id]));
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const hit = byLower.get(raw.trim().toLowerCase());
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length >= max) break;
  }
  return out;
}

/** 8개 고정 콘텐츠타입 id만 통과, 아니면 null(뱃지 미표시 — 에러 아님). */
export function normalizeContentType(v: unknown): string | null {
  return typeof v === "string" && CONTENT_TYPE_IDS.has(v) ? v : null;
}

// 대상 화면(2026-09-15 사용자 확정) — 작품이 주로 폰 화면용인지 PC 화면용인지.
// 업로드 때 만든 AI가 답하고(인제스트 필수 게이트), 초안 검토 창이 이 답으로
// 미리보기 틀(폰 402×874 / PC 1280×800)을 고른다. 사람이 바꾸는 스위치는 일부러
// 없다. contentType의 "mobile"(작품 분류)과는 다른 질문이다 — 폰 우선 웹앱도 있다.
export const TARGET_DEVICES = ["mobile", "desktop"] as const;
export type TargetDevice = (typeof TARGET_DEVICES)[number];

/** "mobile" | "desktop"만 통과(대소문자·앞뒤 공백 무시), 아니면 null. */
export function normalizeTargetDevice(v: unknown): TargetDevice | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return (TARGET_DEVICES as readonly string[]).includes(s) ? (s as TargetDevice) : null;
}

/**
 * 미리보기 틀 결정. 답이 없는 예전 초안(게이트 이전 업로드)은 작품 분류로 짐작한다 —
 * 모바일 앱이면 폰, 나머지는 PC(PC 틀은 어떤 사이트든 무난하게 보여준다).
 */
export function previewDevice(target: unknown, contentType: string | null | undefined): TargetDevice {
  return normalizeTargetDevice(target) ?? (contentType === "mobile" ? "mobile" : "desktop");
}
