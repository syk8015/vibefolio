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
