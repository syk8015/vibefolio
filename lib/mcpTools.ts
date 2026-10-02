// 생성된 파일입니다 — 직접 고치지 마세요.
// 원본: schema/publish.json · 생성: npm run schema:build (scripts/build-schema.mts)
// 손으로 고치면 npm test의 schema-drift 프로브가 막습니다.
//
// 원격 MCP 서버(app/api/mcp)가 tools/list로 내보내는 툴 정의. 셸이 있는 AI가 보는
// stdio 쪽(cli/src/schema.js의 TOOLS)과 **같은 원본**에서 나온다 — 두 통로가 같은
// 설명을 보게 하는 것이 이 생성기의 존재 이유다. 다른 점은 로컬 경로 필드
// (dir · screenshot · video)가 없다는 것뿐: 원격 호출자에겐 우리 서버에 파일이 없다.

export type McpTool = {
  name: string;
  title: string;
  annotations: {
    title: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export const MCP_TOOLS: McpTool[] = [
  {
    "name": "publish_to_nookframe",
    "title": "Upload a work to Nookframe as a draft",
    "annotations": {
      "title": "Upload a work to Nookframe as a draft",
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": false,
      "openWorldHint": false
    },
    "description": "Upload this project to Nookframe (a portfolio for vibe-coded work) as a draft. First take a quick look at the project, then interview the owner: ask them the ownerInterview questions in the chat, in plain words, and wait for their answers — it is REQUIRED (the server rejects the upload without it) and it must be their own words, not yours. Nookframe shows every work in Korean and English: set language (the owner's language, the one you write title/description in), put the same copy in the other language in translation, and list in appLanguages which of ko/en the app's own screens can show — the robot films once per language listed, and for a language the app cannot show, give every demoScript step a caption in it. If the app has no English, ask the owner whether to add an English version before you upload (their app, their call); if it has no Korean, just write Korean captions. If the work has no screen worth filming (a CLI, backend, bot, hardware, or an app behind a private access code), send introFilm instead of demoScript/demoAccess — Nookframe plays it live, no robot filming, no URL needed (see introFilm). You are the AI that built it, so write title/description/demoScript yourself from the repo (README, routes, git log) and pass them in, shaped by those answers. The description must NOT be one paragraph: it is 2-3 lines separated by newlines (\\n) — it is the first-impression copy laid over the work on the card, and a long line wraps and gets cut off on phones (a single paragraph, or any line over 52 columns where a CJK character counts as 2, is rejected). Give deployUrl — a public URL that opens without signing in. This tool talks to Nookframe over the web and cannot reach the owner's filesystem, so there is no dir here: if the work is not deployed, the owner attaches the file themselves at /publish on Nookframe (one .html page, or a .zip of the build output, up to 25MB). If you built this inside the chat, what to give depends on the tool. A tool that deploys to a real address (Qwen Web Dev, Bolt, Lovable, Replit) is fine — publish it and give that address. A Claude artifact share link is NOT: those pages sit behind a bot check the filming robot cannot pass. That is not a login — a person gets through and a robot does not — so do not ask the owner to fix their sharing settings. Send the artifact's whole HTML in htmlBody instead — that needs nothing from the owner and is the fastest route for a one-file work. Only if it is too big, or has separate CSS/JS/asset files, ask the owner to attach it as a zip at /publish. If it is not deployed and needs a server or DB so a file upload will not do, you may pass a public GitHub repo URL as deployUrl instead (a last resort: the repo is cloned and run — JS repos via npm run dev/start, Python web apps by detecting Streamlit/Gradio/Dash/Django/Flask/FastAPI then pip install + run (Django also gets migrate run for it), and projects with no web screen (CLI tools, bots, backends) are filmed as a live terminal session where the robot types the commands (put the exact commands in demoScript and it gets much better). Private repos fail; apps needing a remote DB get a read-only demo). If the landing page and the actual app screen are different URLs, also pass appUrl (the demo and the embed open appUrl). demoAccess is REQUIRED (unless you send introFilm or attach a video) — the filming robot never logs in, so decide 'what actually works before login' and answer with exactly one of: { url, params, note } if there is a way in without login; { noLogin: true, note: \"one line on what you checked\" } if no login is needed at all and every feature is usable from the first screen (noLogin without note is rejected); { impossible: true, note: \"why\" } if a guest path is fundamentally impossible (E2E encryption, mandatory device pairing). In that last case only the landing page gets filmed, so attaching a video is strongly recommended. Without one of the three the server rejects with 400. Account credentials are not accepted. The film and card are public, so screens the robot opens must show fake or sample data, never real people's records; if the app needs a demo mode to be filmable, ask the human before changing their code or deploying. targetDevice is REQUIRED too: \"mobile\" if the app was designed mainly for phone screens, \"desktop\" if for computer browsers (not the same as contentType) — the owner's draft preview is framed from it, while the robot always films a 1280x720 desktop browser. You cannot attach a screenshot or a demo video through this tool — if the owner has one, tell them to add it at /publish on Nookframe (a video attached there replaces the automatic filming). Order demoScript.steps by importance — step 1 is the feature that absolutely cannot be missing. Uploading the same URL again does not create a new draft, it updates the existing one (use this to edit content); a draft made from an uploaded file has no URL to match, so to replace its files — or to change the URL — pass draftId, the draft id from the publish result. When you report back, tell the human it is a DRAFT: nothing is public until they open the review link and press publish.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "Short, clear product name"
        },
        "description": {
          "type": "string",
          "description": "2-3 lines separated by newlines (if unfinished, say where it is headed)"
        },
        "builderNote": {
          "type": "string",
          "description": "(optional) Short one-liner shown as a speech bubble on the public card, drawn from ownerInterview.howIUse in the owner's voice. One line, not a paragraph — e.g. \"I check it every Monday morning\""
        },
        "demoHighlights": {
          "type": "string",
          "description": "(legacy — can be omitted when demoScript is present) 3-5 highlights in prose, max 500 chars"
        },
        "ownerInterview": {
          "type": "object",
          "description": "Required. After a quick look at the project (what it is, what works, whether there is anything to see), ask the OWNER these questions in the chat in plain everyday words — before you write the payload — and wait for their answers; never answer them yourself (placeholders like \"none\" or \"N/A\" are rejected). If the project is half-built or has nothing to see yet, say so first and ask whether to upload it now as a work in progress. Keep filming mechanics (robots, repos, logs, test data) out of this message — ask about those separately afterwards, in one plain sentence. A demo is not the real app, and only the person who built and uses it knows what matters. Put their own words here (max 300 characters each), then use them: open or linger on the proudMoment/mustSee scenes in demoScript, draw builderNote from howIUse (one line, in their voice), and keep any screen that shows a hide item out of the script. The answers are not printed on the public page, and hide stays private.",
          "properties": {
            "proudMoment": {
              "type": "string",
              "description": "The part of the app the owner most wants people to see — a screen, a feature or a result (a part of the app, not a moment in their life)"
            },
            "howIUse": {
              "type": "string",
              "description": "How the owner actually uses it: when, how often, what for — or, if they have not used it yet, what they built it for"
            },
            "mustSee": {
              "type": "string",
              "description": "The one thing a first-time viewer must notice"
            },
            "hide": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "(optional) Anything that must never be shown — people's names, amounts, places, health details (max 12 items, 80 characters each)"
            }
          },
          "required": [
            "proudMoment",
            "howIUse",
            "mustSee"
          ]
        },
        "language": {
          "type": "string",
          "enum": [
            "ko",
            "en"
          ],
          "description": "Required. The owner's language — the one title, description and builderNote are written in (the language the owner writes to you in). Every work also carries the other language in translation, and each visitor sees their own language's version."
        },
        "appLanguages": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "ko",
              "en"
            ]
          },
          "description": "Required. Which of ko/en the app's OWN screens can show — check the code (a language switch, i18n files, hard-coded text): [\"ko\"] for a Korean-only app, [\"ko\",\"en\"] if it has both, [] if neither. The robot films once per language listed; for each language missing, every demoScript step needs caption.<that language>. If English is missing, ask the owner before anything else: \"Should I add an English version of the app?\" — it means changing and redeploying their app, so it is their call. Yes → add it, deploy it, list both. No → write English captions. If only Korean is missing, do not ask — just write Korean captions."
        },
        "translation": {
          "type": "object",
          "description": "Required. The same title, description and builderNote in the OTHER language (en if language is ko, ko if it is en). Write it the way a native speaker would, not word for word. The description follows the same 2-3 line rule (52 columns per line at most).",
          "properties": {
            "title": {
              "type": "string",
              "description": "Product name as a reader of that language should see it (max 80 characters)"
            },
            "description": {
              "type": "string",
              "description": "2-3 lines separated by newlines"
            },
            "builderNote": {
              "type": "string",
              "description": "(optional) The one-liner in that language"
            }
          },
          "required": [
            "title",
            "description"
          ]
        },
        "demoScript": {
          "type": "object",
          "description": "The demo script a filming robot follows. You built this app, so you know which screen to open and what to press for the good part to show — do not leave the robot guessing from pixels. This script IS the whole video (the robot films exactly these steps and stops): cover every feature worth showing, 5-8 steps is right (max 10, min 4), in order of importance (the film runs ~30s and is cut from the end — step 1 must be the feature that absolutely cannot be missing). Every step must carry both an action and a selector (or where, if you do not know the selector) — a step with only a goal is a table of contents, not a script, and the server rejects a script made only of those (at least 3 steps must meet this bar). Set hold (seconds, 0.5-4) to linger on a step's result. If the app is slow to show a result (an AI answer, a chart that computes, a heavy first load), add a step with action \"wait\" right after the step that triggers it: give the selector of what should appear and the robot waits up to 10 seconds for it before moving on, so the film catches the result instead of an empty screen (without a selector it simply pauses for hold seconds, default 2). The robot verifies each step on the real screen and skips what it cannot find. It films a 1280x720 desktop browser, so selectors must match the layout at that size. It has no account (cannot log in) and never opens file pickers; clicks that save, send or delete are skipped or answered with a fake success that never reaches the real server, so do not build a step on a result only the server can produce (an AI reply, data reloaded from the database).",
          "properties": {
            "steps": {
              "type": "array",
              "maxItems": 10,
              "items": {
                "type": "object",
                "properties": {
                  "goal": {
                    "type": "string",
                    "description": "What this beat proves (max 120 chars)"
                  },
                  "selector": {
                    "type": "string",
                    "description": "CSS selector for that control — you know the code, so give the exact one (max 250 chars). For action=wait: the element whose appearance ends the wait (e.g. the result panel)"
                  },
                  "toSelector": {
                    "type": "string",
                    "description": "CSS selector for the drop target when action=drag"
                  },
                  "where": {
                    "type": "string",
                    "description": "How to find it by eye (visible label, position) — the fallback when the selector misses (max 120 chars)"
                  },
                  "action": {
                    "type": "string",
                    "enum": [
                      "click",
                      "type",
                      "drag",
                      "scroll",
                      "hover",
                      "draw",
                      "focus",
                      "navigate",
                      "wait"
                    ]
                  },
                  "to": {
                    "type": "string",
                    "enum": [
                      "back"
                    ],
                    "description": "Only for action=navigate: go back to the previous screen using browser history. No selector needed — do not spend a click beat on an in-page back button"
                  },
                  "text": {
                    "type": "string",
                    "description": "What to type when action=type (max 60 chars)"
                  },
                  "expect": {
                    "type": "string",
                    "description": "What should appear on screen afterwards (max 120 chars)"
                  },
                  "hold": {
                    "type": "number",
                    "description": "How many seconds to hold on this step's result (0.5-4). Only for beats that need a slow look. For action=wait without a selector: how long to pause"
                  },
                  "caption": {
                    "type": "object",
                    "properties": {
                      "en": {
                        "type": "string"
                      },
                      "ko": {
                        "type": "string"
                      }
                    },
                    "description": "Required for every language in ko/en that appLanguages does NOT list (navigate and wait steps need none): one short caption for this scene in that language (max 90 characters), drawn from the owner's interview answers — e.g. { \"en\": \"Every room, live — updated every minute.\" }. The player lays it over the video until the next caption; it is never burned into the film."
                  }
                },
                "required": [
                  "goal"
                ]
              }
            },
            "skip": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Things every app has, so they waste a beat (e.g. dark mode or language toggles)"
            },
            "prep": {
              "type": "string",
              "description": "(optional) One line of setup before the tour"
            }
          },
          "required": [
            "steps"
          ]
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "ChatGPT",
              "Claude",
              "Claude Code",
              "Cursor",
              "GitHub Copilot",
              "Gemini",
              "v0",
              "Bolt.new",
              "Windsurf",
              "Lovable",
              "Replit AI",
              "Devin",
              "Aider",
              "Continue.dev",
              "Codeium",
              "Amazon Q",
              "Perplexity",
              "Midjourney",
              "DALL-E",
              "Stable Diffusion",
              "Ideogram",
              "Flux",
              "Runway",
              "Kling",
              "Pika",
              "Suno",
              "ElevenLabs"
            ]
          },
          "description": "AI tools used for this work. Spellings outside the list are silently dropped by the server."
        },
        "contentType": {
          "type": "string",
          "enum": [
            "web-app",
            "saas",
            "mobile",
            "game",
            "extension",
            "ai-service",
            "media",
            "other"
          ]
        },
        "targetDevice": {
          "type": "string",
          "enum": [
            "mobile",
            "desktop"
          ],
          "description": "Required. The screen this app was mainly designed for: \"mobile\" = phone screens (a narrow single column, a bottom tab bar, touch-first); \"desktop\" = computer browsers (wide layouts, sidebars, hover). If it works on both, pick the one it was designed for first. Not the same as contentType — a phone-first web app is contentType \"web-app\" with targetDevice \"mobile\". The owner's draft preview is framed as a phone or a desktop screen from this answer. The demo robot itself always films a 1280x720 desktop browser, so demoScript selectors must match the layout at that size."
        },
        "deployUrl": {
          "type": "string",
          "description": "Deployed public URL"
        },
        "appUrl": {
          "type": "string",
          "description": "URL of the actual app screen (when it differs from the landing page — the demo and the embed open this one)"
        },
        "draftId": {
          "type": "string",
          "description": "(optional) Id of one of your drafts to update in place — it is in every publish result and in list_nookframe_drafts. Without it a draft is matched by URL, so re-uploading a folder (dir) or changing the URL leaves a second draft behind; with it, that draft's fields and its files or URL are replaced. Published projects are refused."
        },
        "newDraft": {
          "type": "boolean",
          "description": "(optional) Set true to always create a NEW draft instead of updating the one with the same URL. Use it when the owner wants to keep the draft already there (publishing the same URL again overwrites it by default), or when the owner confirmed they want a second card although a PUBLISHED work with the same URL or title exists (otherwise that is rejected with PUBLISHED_TWIN). Cannot be combined with draftId."
        },
        "demoAccess": {
          "type": "object",
          "description": "Required. The filming robot never logs in — judge not 'does a screen appear' but 'what actually works before login', and answer with exactly one of url, noLogin or impossible. The most common failure is an app that looks fine when logged out but has empty lists and bounces saves to a login screen (a screen did appear, so it is not even caught as a failure). Without one of the three the server rejects with 400. Never include account credentials (they are not accepted).",
          "properties": {
            "url": {
              "type": "string",
              "description": "Demo/guest entry URL or path (e.g. \"/demo\")"
            },
            "params": {
              "type": "object",
              "additionalProperties": {
                "type": "string"
              },
              "description": "Extra query parameters to append to the entry URL (e.g. {\"guest\":\"1\"})"
            },
            "note": {
              "type": "string",
              "description": "One or two sentences on how to reach demo mode there (max 500 chars). If impossible, why it is impossible"
            },
            "impossible": {
              "type": "boolean",
              "description": "Declares that a guest path is fundamentally impossible (E2E encryption, mandatory device pairing, etc.). If true, automatic filming captures only the landing page and says so in the report — attaching a video is recommended."
            },
            "noLogin": {
              "type": "boolean",
              "description": "Declares that no login is needed at all and every feature is usable from the first screen. Do not set it just because the landing page looks fine — only after checking the actual routes and guards."
            }
          }
        },
        "introFilm": {
          "type": "object",
          "description": "Intro film for a work with NO screen worth filming — a CLI tool, backend, bot, hardware/IoT project, or an app locked behind a private access code. Instead of robot filming, Nookframe plays these scenes live on the card in one of its own motion styles, so send introFilm INSTEAD of demoScript/demoAccess (those gates are skipped, no deployUrl needed). Apps with a real screen must keep robot filming — do not use introFilm for them. You only fill text slots; layout, timing and animation are Nookframe's. Every on-screen text is { \"en\": \"...\", \"ko\": \"...\" } (both languages, the owner's meaning, short). Numbers must be honest: scenes that show numbers (hook, items, terminal, alert, stats) need data: \"sample\" (made-up example values — the film is labelled 'Sample data') or \"measured\" (real, with source: the file/log/doc it came from). Never present invented numbers as measured, and never put real people's names, addresses, room names, keys or private usage in a film. Write the story from the ownerInterview answers: why they built it (story/hook), what it does (flow/terminal/items), the moment they are proud of (alert/stats), then ending. 3–8 scenes, about 20–35 seconds total. Scene kinds and their fields — hook: { label, value (e.g. \"68%\", \"12,480\", ≤12 chars), alarm?, line }; story: { line, line2 }; items: { items: [{ value, label, alarm? }] ×2–6, line }; flow: { nodes: [label] ×2–5, line }; terminal: { command (≤60), output: [plain text lines] ×1–8, line }; alert: { title, body, line, line2 } (a phone notification + a headline); stats: { stats: [{ value (≤6), unit, label }] ×2–4, line }; ending: { line, line2, name }. Text limits: line ≤60, line2 ≤40–48, labels ≤20–40 characters; the server tells you the exact field if one is too long. style: send { \"text\": \"bignum\", \"mood\": \"cinematic\" } — Nookframe currently draws every intro film in this one polished look (bold numbers on a dark, cinematic stage), so do not promise the owner other looks.",
          "properties": {
            "style": {
              "type": "object",
              "properties": {
                "text": {
                  "type": "string",
                  "enum": [
                    "hand",
                    "bignum",
                    "cinematic"
                  ]
                },
                "mood": {
                  "type": "string",
                  "enum": [
                    "hand",
                    "bignum",
                    "cinematic"
                  ]
                }
              },
              "required": [
                "text",
                "mood"
              ]
            },
            "scenes": {
              "type": "array",
              "minItems": 3,
              "maxItems": 8,
              "items": {
                "type": "object",
                "properties": {
                  "kind": {
                    "type": "string",
                    "enum": [
                      "hook",
                      "story",
                      "items",
                      "flow",
                      "terminal",
                      "alert",
                      "stats",
                      "ending"
                    ]
                  },
                  "data": {
                    "type": "string",
                    "enum": [
                      "sample",
                      "measured"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Where measured numbers came from (file, log, doc). Required when data is \"measured\"."
                  }
                },
                "required": [
                  "kind"
                ]
              }
            }
          },
          "required": [
            "style",
            "scenes"
          ]
        },
        "htmlBody": {
          "type": "string",
          "description": "The COMPLETE HTML of a single-file app, as text — use it when the work is not deployed anywhere and you cannot upload a file (a Claude artifact, a one-file page you wrote in this chat). It is stored as index.html and filmed like any static site, so it must be the whole document, not a fragment: send everything from <!doctype html> through </html>, with the CSS and JS inlined. If your answer would be cut off before the end, do NOT send a partial document — the server rejects it, and a half-written app would be published if it did not. Only for single-file works; anything with separate CSS/JS/asset files needs a real upload instead. Max 2MB."
        }
      },
      "required": [
        "title",
        "targetDevice",
        "ownerInterview",
        "language",
        "appLanguages",
        "translation"
      ]
    }
  },
  {
    "name": "check_nookframe_payload",
    "title": "Check an upload without saving (dry run)",
    "annotations": {
      "title": "Check an upload without saving (dry run)",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "description": "Dry run a Nookframe publish payload: the server runs every gate it would run for real (demo script minimum, the login question, the description's 2-3 line shape, targetDevice, the owner interview, the two languages and captions, the entry URL, selector existence, estimated film length) and answers whether this payload would be accepted — without creating a draft or uploading anything. Call it before publish_to_nookframe whenever you are unsure, and after fixing a rejection. Same input as publish_to_nookframe. The answer also says whether publishing would UPDATE the draft already at that URL or create a new one. What it cannot check: the uploaded files themselves and the draft count limit.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "Short, clear product name"
        },
        "description": {
          "type": "string",
          "description": "2-3 lines separated by newlines (if unfinished, say where it is headed)"
        },
        "builderNote": {
          "type": "string",
          "description": "(optional) Short one-liner shown as a speech bubble on the public card, drawn from ownerInterview.howIUse in the owner's voice. One line, not a paragraph — e.g. \"I check it every Monday morning\""
        },
        "demoHighlights": {
          "type": "string",
          "description": "(legacy — can be omitted when demoScript is present) 3-5 highlights in prose, max 500 chars"
        },
        "ownerInterview": {
          "type": "object",
          "description": "Required. After a quick look at the project (what it is, what works, whether there is anything to see), ask the OWNER these questions in the chat in plain everyday words — before you write the payload — and wait for their answers; never answer them yourself (placeholders like \"none\" or \"N/A\" are rejected). If the project is half-built or has nothing to see yet, say so first and ask whether to upload it now as a work in progress. Keep filming mechanics (robots, repos, logs, test data) out of this message — ask about those separately afterwards, in one plain sentence. A demo is not the real app, and only the person who built and uses it knows what matters. Put their own words here (max 300 characters each), then use them: open or linger on the proudMoment/mustSee scenes in demoScript, draw builderNote from howIUse (one line, in their voice), and keep any screen that shows a hide item out of the script. The answers are not printed on the public page, and hide stays private.",
          "properties": {
            "proudMoment": {
              "type": "string",
              "description": "The part of the app the owner most wants people to see — a screen, a feature or a result (a part of the app, not a moment in their life)"
            },
            "howIUse": {
              "type": "string",
              "description": "How the owner actually uses it: when, how often, what for — or, if they have not used it yet, what they built it for"
            },
            "mustSee": {
              "type": "string",
              "description": "The one thing a first-time viewer must notice"
            },
            "hide": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "(optional) Anything that must never be shown — people's names, amounts, places, health details (max 12 items, 80 characters each)"
            }
          },
          "required": [
            "proudMoment",
            "howIUse",
            "mustSee"
          ]
        },
        "language": {
          "type": "string",
          "enum": [
            "ko",
            "en"
          ],
          "description": "Required. The owner's language — the one title, description and builderNote are written in (the language the owner writes to you in). Every work also carries the other language in translation, and each visitor sees their own language's version."
        },
        "appLanguages": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "ko",
              "en"
            ]
          },
          "description": "Required. Which of ko/en the app's OWN screens can show — check the code (a language switch, i18n files, hard-coded text): [\"ko\"] for a Korean-only app, [\"ko\",\"en\"] if it has both, [] if neither. The robot films once per language listed; for each language missing, every demoScript step needs caption.<that language>. If English is missing, ask the owner before anything else: \"Should I add an English version of the app?\" — it means changing and redeploying their app, so it is their call. Yes → add it, deploy it, list both. No → write English captions. If only Korean is missing, do not ask — just write Korean captions."
        },
        "translation": {
          "type": "object",
          "description": "Required. The same title, description and builderNote in the OTHER language (en if language is ko, ko if it is en). Write it the way a native speaker would, not word for word. The description follows the same 2-3 line rule (52 columns per line at most).",
          "properties": {
            "title": {
              "type": "string",
              "description": "Product name as a reader of that language should see it (max 80 characters)"
            },
            "description": {
              "type": "string",
              "description": "2-3 lines separated by newlines"
            },
            "builderNote": {
              "type": "string",
              "description": "(optional) The one-liner in that language"
            }
          },
          "required": [
            "title",
            "description"
          ]
        },
        "demoScript": {
          "type": "object",
          "description": "The demo script a filming robot follows. You built this app, so you know which screen to open and what to press for the good part to show — do not leave the robot guessing from pixels. This script IS the whole video (the robot films exactly these steps and stops): cover every feature worth showing, 5-8 steps is right (max 10, min 4), in order of importance (the film runs ~30s and is cut from the end — step 1 must be the feature that absolutely cannot be missing). Every step must carry both an action and a selector (or where, if you do not know the selector) — a step with only a goal is a table of contents, not a script, and the server rejects a script made only of those (at least 3 steps must meet this bar). Set hold (seconds, 0.5-4) to linger on a step's result. If the app is slow to show a result (an AI answer, a chart that computes, a heavy first load), add a step with action \"wait\" right after the step that triggers it: give the selector of what should appear and the robot waits up to 10 seconds for it before moving on, so the film catches the result instead of an empty screen (without a selector it simply pauses for hold seconds, default 2). The robot verifies each step on the real screen and skips what it cannot find. It films a 1280x720 desktop browser, so selectors must match the layout at that size. It has no account (cannot log in) and never opens file pickers; clicks that save, send or delete are skipped or answered with a fake success that never reaches the real server, so do not build a step on a result only the server can produce (an AI reply, data reloaded from the database).",
          "properties": {
            "steps": {
              "type": "array",
              "maxItems": 10,
              "items": {
                "type": "object",
                "properties": {
                  "goal": {
                    "type": "string",
                    "description": "What this beat proves (max 120 chars)"
                  },
                  "selector": {
                    "type": "string",
                    "description": "CSS selector for that control — you know the code, so give the exact one (max 250 chars). For action=wait: the element whose appearance ends the wait (e.g. the result panel)"
                  },
                  "toSelector": {
                    "type": "string",
                    "description": "CSS selector for the drop target when action=drag"
                  },
                  "where": {
                    "type": "string",
                    "description": "How to find it by eye (visible label, position) — the fallback when the selector misses (max 120 chars)"
                  },
                  "action": {
                    "type": "string",
                    "enum": [
                      "click",
                      "type",
                      "drag",
                      "scroll",
                      "hover",
                      "draw",
                      "focus",
                      "navigate",
                      "wait"
                    ]
                  },
                  "to": {
                    "type": "string",
                    "enum": [
                      "back"
                    ],
                    "description": "Only for action=navigate: go back to the previous screen using browser history. No selector needed — do not spend a click beat on an in-page back button"
                  },
                  "text": {
                    "type": "string",
                    "description": "What to type when action=type (max 60 chars)"
                  },
                  "expect": {
                    "type": "string",
                    "description": "What should appear on screen afterwards (max 120 chars)"
                  },
                  "hold": {
                    "type": "number",
                    "description": "How many seconds to hold on this step's result (0.5-4). Only for beats that need a slow look. For action=wait without a selector: how long to pause"
                  },
                  "caption": {
                    "type": "object",
                    "properties": {
                      "en": {
                        "type": "string"
                      },
                      "ko": {
                        "type": "string"
                      }
                    },
                    "description": "Required for every language in ko/en that appLanguages does NOT list (navigate and wait steps need none): one short caption for this scene in that language (max 90 characters), drawn from the owner's interview answers — e.g. { \"en\": \"Every room, live — updated every minute.\" }. The player lays it over the video until the next caption; it is never burned into the film."
                  }
                },
                "required": [
                  "goal"
                ]
              }
            },
            "skip": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Things every app has, so they waste a beat (e.g. dark mode or language toggles)"
            },
            "prep": {
              "type": "string",
              "description": "(optional) One line of setup before the tour"
            }
          },
          "required": [
            "steps"
          ]
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "ChatGPT",
              "Claude",
              "Claude Code",
              "Cursor",
              "GitHub Copilot",
              "Gemini",
              "v0",
              "Bolt.new",
              "Windsurf",
              "Lovable",
              "Replit AI",
              "Devin",
              "Aider",
              "Continue.dev",
              "Codeium",
              "Amazon Q",
              "Perplexity",
              "Midjourney",
              "DALL-E",
              "Stable Diffusion",
              "Ideogram",
              "Flux",
              "Runway",
              "Kling",
              "Pika",
              "Suno",
              "ElevenLabs"
            ]
          },
          "description": "AI tools used for this work. Spellings outside the list are silently dropped by the server."
        },
        "contentType": {
          "type": "string",
          "enum": [
            "web-app",
            "saas",
            "mobile",
            "game",
            "extension",
            "ai-service",
            "media",
            "other"
          ]
        },
        "targetDevice": {
          "type": "string",
          "enum": [
            "mobile",
            "desktop"
          ],
          "description": "Required. The screen this app was mainly designed for: \"mobile\" = phone screens (a narrow single column, a bottom tab bar, touch-first); \"desktop\" = computer browsers (wide layouts, sidebars, hover). If it works on both, pick the one it was designed for first. Not the same as contentType — a phone-first web app is contentType \"web-app\" with targetDevice \"mobile\". The owner's draft preview is framed as a phone or a desktop screen from this answer. The demo robot itself always films a 1280x720 desktop browser, so demoScript selectors must match the layout at that size."
        },
        "deployUrl": {
          "type": "string",
          "description": "Deployed public URL"
        },
        "appUrl": {
          "type": "string",
          "description": "URL of the actual app screen (when it differs from the landing page — the demo and the embed open this one)"
        },
        "draftId": {
          "type": "string",
          "description": "(optional) Id of one of your drafts to update in place — it is in every publish result and in list_nookframe_drafts. Without it a draft is matched by URL, so re-uploading a folder (dir) or changing the URL leaves a second draft behind; with it, that draft's fields and its files or URL are replaced. Published projects are refused."
        },
        "newDraft": {
          "type": "boolean",
          "description": "(optional) Set true to always create a NEW draft instead of updating the one with the same URL. Use it when the owner wants to keep the draft already there (publishing the same URL again overwrites it by default), or when the owner confirmed they want a second card although a PUBLISHED work with the same URL or title exists (otherwise that is rejected with PUBLISHED_TWIN). Cannot be combined with draftId."
        },
        "demoAccess": {
          "type": "object",
          "description": "Required. The filming robot never logs in — judge not 'does a screen appear' but 'what actually works before login', and answer with exactly one of url, noLogin or impossible. The most common failure is an app that looks fine when logged out but has empty lists and bounces saves to a login screen (a screen did appear, so it is not even caught as a failure). Without one of the three the server rejects with 400. Never include account credentials (they are not accepted).",
          "properties": {
            "url": {
              "type": "string",
              "description": "Demo/guest entry URL or path (e.g. \"/demo\")"
            },
            "params": {
              "type": "object",
              "additionalProperties": {
                "type": "string"
              },
              "description": "Extra query parameters to append to the entry URL (e.g. {\"guest\":\"1\"})"
            },
            "note": {
              "type": "string",
              "description": "One or two sentences on how to reach demo mode there (max 500 chars). If impossible, why it is impossible"
            },
            "impossible": {
              "type": "boolean",
              "description": "Declares that a guest path is fundamentally impossible (E2E encryption, mandatory device pairing, etc.). If true, automatic filming captures only the landing page and says so in the report — attaching a video is recommended."
            },
            "noLogin": {
              "type": "boolean",
              "description": "Declares that no login is needed at all and every feature is usable from the first screen. Do not set it just because the landing page looks fine — only after checking the actual routes and guards."
            }
          }
        },
        "introFilm": {
          "type": "object",
          "description": "Intro film for a work with NO screen worth filming — a CLI tool, backend, bot, hardware/IoT project, or an app locked behind a private access code. Instead of robot filming, Nookframe plays these scenes live on the card in one of its own motion styles, so send introFilm INSTEAD of demoScript/demoAccess (those gates are skipped, no deployUrl needed). Apps with a real screen must keep robot filming — do not use introFilm for them. You only fill text slots; layout, timing and animation are Nookframe's. Every on-screen text is { \"en\": \"...\", \"ko\": \"...\" } (both languages, the owner's meaning, short). Numbers must be honest: scenes that show numbers (hook, items, terminal, alert, stats) need data: \"sample\" (made-up example values — the film is labelled 'Sample data') or \"measured\" (real, with source: the file/log/doc it came from). Never present invented numbers as measured, and never put real people's names, addresses, room names, keys or private usage in a film. Write the story from the ownerInterview answers: why they built it (story/hook), what it does (flow/terminal/items), the moment they are proud of (alert/stats), then ending. 3–8 scenes, about 20–35 seconds total. Scene kinds and their fields — hook: { label, value (e.g. \"68%\", \"12,480\", ≤12 chars), alarm?, line }; story: { line, line2 }; items: { items: [{ value, label, alarm? }] ×2–6, line }; flow: { nodes: [label] ×2–5, line }; terminal: { command (≤60), output: [plain text lines] ×1–8, line }; alert: { title, body, line, line2 } (a phone notification + a headline); stats: { stats: [{ value (≤6), unit, label }] ×2–4, line }; ending: { line, line2, name }. Text limits: line ≤60, line2 ≤40–48, labels ≤20–40 characters; the server tells you the exact field if one is too long. style: send { \"text\": \"bignum\", \"mood\": \"cinematic\" } — Nookframe currently draws every intro film in this one polished look (bold numbers on a dark, cinematic stage), so do not promise the owner other looks.",
          "properties": {
            "style": {
              "type": "object",
              "properties": {
                "text": {
                  "type": "string",
                  "enum": [
                    "hand",
                    "bignum",
                    "cinematic"
                  ]
                },
                "mood": {
                  "type": "string",
                  "enum": [
                    "hand",
                    "bignum",
                    "cinematic"
                  ]
                }
              },
              "required": [
                "text",
                "mood"
              ]
            },
            "scenes": {
              "type": "array",
              "minItems": 3,
              "maxItems": 8,
              "items": {
                "type": "object",
                "properties": {
                  "kind": {
                    "type": "string",
                    "enum": [
                      "hook",
                      "story",
                      "items",
                      "flow",
                      "terminal",
                      "alert",
                      "stats",
                      "ending"
                    ]
                  },
                  "data": {
                    "type": "string",
                    "enum": [
                      "sample",
                      "measured"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Where measured numbers came from (file, log, doc). Required when data is \"measured\"."
                  }
                },
                "required": [
                  "kind"
                ]
              }
            }
          },
          "required": [
            "style",
            "scenes"
          ]
        },
        "htmlBody": {
          "type": "string",
          "description": "The COMPLETE HTML of a single-file app, as text — use it when the work is not deployed anywhere and you cannot upload a file (a Claude artifact, a one-file page you wrote in this chat). It is stored as index.html and filmed like any static site, so it must be the whole document, not a fragment: send everything from <!doctype html> through </html>, with the CSS and JS inlined. If your answer would be cut off before the end, do NOT send a partial document — the server rejects it, and a half-written app would be published if it did not. Only for single-file works; anything with separate CSS/JS/asset files needs a real upload instead. Max 2MB."
        }
      },
      "required": [
        "title",
        "targetDevice",
        "ownerInterview",
        "language",
        "appLanguages",
        "translation"
      ]
    }
  },
  {
    "name": "rerecord_nookframe_demo",
    "title": "Submit a new demo script for re-recording",
    "annotations": {
      "title": "Submit a new demo script for re-recording",
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "description": "Submit a rewritten demo script when the owner is unhappy with an already-published Nookframe work's demo video. Use it when you were handed the prompt the owner generated by pressing [Request re-record] on Nookframe — that prompt contains the project id, the full script currently in place, and the owner's own complaint, so leave the steps that are fine and fix only what was called out. Important: submitting does NOT change the video. The new script is stored in a PENDING slot, and filming starts only after the owner reviews it in the dashboard and presses [Re-record] — you must say this when you report back to the human. The script gate is the same as publishing (at least 4 steps, of which 3 or more carry both an action and a selector).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Project id — it is written in the re-record prompt the owner gave you"
        },
        "demoScript": {
          "type": "object",
          "description": "The demo script a filming robot follows. You built this app, so you know which screen to open and what to press for the good part to show — do not leave the robot guessing from pixels. This script IS the whole video (the robot films exactly these steps and stops): cover every feature worth showing, 5-8 steps is right (max 10, min 4), in order of importance (the film runs ~30s and is cut from the end — step 1 must be the feature that absolutely cannot be missing). Every step must carry both an action and a selector (or where, if you do not know the selector) — a step with only a goal is a table of contents, not a script, and the server rejects a script made only of those (at least 3 steps must meet this bar). Set hold (seconds, 0.5-4) to linger on a step's result. If the app is slow to show a result (an AI answer, a chart that computes, a heavy first load), add a step with action \"wait\" right after the step that triggers it: give the selector of what should appear and the robot waits up to 10 seconds for it before moving on, so the film catches the result instead of an empty screen (without a selector it simply pauses for hold seconds, default 2). The robot verifies each step on the real screen and skips what it cannot find. It films a 1280x720 desktop browser, so selectors must match the layout at that size. It has no account (cannot log in) and never opens file pickers; clicks that save, send or delete are skipped or answered with a fake success that never reaches the real server, so do not build a step on a result only the server can produce (an AI reply, data reloaded from the database).",
          "properties": {
            "steps": {
              "type": "array",
              "maxItems": 10,
              "items": {
                "type": "object",
                "properties": {
                  "goal": {
                    "type": "string",
                    "description": "What this beat proves (max 120 chars)"
                  },
                  "selector": {
                    "type": "string",
                    "description": "CSS selector for that control — you know the code, so give the exact one (max 250 chars). For action=wait: the element whose appearance ends the wait (e.g. the result panel)"
                  },
                  "toSelector": {
                    "type": "string",
                    "description": "CSS selector for the drop target when action=drag"
                  },
                  "where": {
                    "type": "string",
                    "description": "How to find it by eye (visible label, position) — the fallback when the selector misses (max 120 chars)"
                  },
                  "action": {
                    "type": "string",
                    "enum": [
                      "click",
                      "type",
                      "drag",
                      "scroll",
                      "hover",
                      "draw",
                      "focus",
                      "navigate",
                      "wait"
                    ]
                  },
                  "to": {
                    "type": "string",
                    "enum": [
                      "back"
                    ],
                    "description": "Only for action=navigate: go back to the previous screen using browser history. No selector needed — do not spend a click beat on an in-page back button"
                  },
                  "text": {
                    "type": "string",
                    "description": "What to type when action=type (max 60 chars)"
                  },
                  "expect": {
                    "type": "string",
                    "description": "What should appear on screen afterwards (max 120 chars)"
                  },
                  "hold": {
                    "type": "number",
                    "description": "How many seconds to hold on this step's result (0.5-4). Only for beats that need a slow look. For action=wait without a selector: how long to pause"
                  },
                  "caption": {
                    "type": "object",
                    "properties": {
                      "en": {
                        "type": "string"
                      },
                      "ko": {
                        "type": "string"
                      }
                    },
                    "description": "Required for every language in ko/en that appLanguages does NOT list (navigate and wait steps need none): one short caption for this scene in that language (max 90 characters), drawn from the owner's interview answers — e.g. { \"en\": \"Every room, live — updated every minute.\" }. The player lays it over the video until the next caption; it is never burned into the film."
                  }
                },
                "required": [
                  "goal"
                ]
              }
            },
            "skip": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Things every app has, so they waste a beat (e.g. dark mode or language toggles)"
            },
            "prep": {
              "type": "string",
              "description": "(optional) One line of setup before the tour"
            }
          },
          "required": [
            "steps"
          ]
        },
        "note": {
          "type": "string",
          "description": "One line on what changed and why (the owner reads this in the dashboard to decide, max 1000 chars)"
        }
      },
      "required": [
        "id",
        "demoScript"
      ]
    }
  },
  {
    "name": "get_nookframe_status",
    "title": "Get draft and filming status",
    "annotations": {
      "title": "Get draft and filming status",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "description": "Check where my Nookframe works stand: draft or public, and whether the demo video is filmed (not-started / queued / in-progress / done / failed / held), with the video link when it is ready and the reason when filming failed. Pass id (from a publish result or list_nookframe_drafts) for one work; omit it to list all my works, published ones included. Filming starts only after the owner publishes and runs in batches, so it can take hours — check now and then, never in a tight loop.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "(optional) Work id — omit to list every work"
        }
      }
    }
  },
  {
    "name": "list_nookframe_drafts",
    "title": "List my drafts",
    "annotations": {
      "title": "List my drafts",
      "readOnlyHint": true,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "description": "List my Nookframe drafts (not yet published). Published projects do not appear here — get_nookframe_status lists those too, with their filming state.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "update_nookframe_draft",
    "title": "Edit a draft",
    "annotations": {
      "title": "Edit a draft",
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "description": "Edit a Nookframe draft's metadata (title/description/builderNote/demoHighlights/demoScript/tags/contentType/targetDevice/demoAccess/ownerInterview/language/appLanguages/translation). Only the fields you send change — but the language rules are judged on the result: changing language needs a translation in the new other language, and a demoScript must keep its captions. This tool cannot swap the URL or the files — call publish_to_nookframe with draftId set to this draft's id (publishing the same URL again also works). Published projects cannot be edited.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Draft id (find it with list_nookframe_drafts)"
        },
        "title": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "builderNote": {
          "type": "string"
        },
        "demoHighlights": {
          "type": "string"
        },
        "demoScript": {
          "type": "object",
          "description": "Demo script — same shape as publish_to_nookframe's demoScript { steps, skip?, prep? }"
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "ChatGPT",
              "Claude",
              "Claude Code",
              "Cursor",
              "GitHub Copilot",
              "Gemini",
              "v0",
              "Bolt.new",
              "Windsurf",
              "Lovable",
              "Replit AI",
              "Devin",
              "Aider",
              "Continue.dev",
              "Codeium",
              "Amazon Q",
              "Perplexity",
              "Midjourney",
              "DALL-E",
              "Stable Diffusion",
              "Ideogram",
              "Flux",
              "Runway",
              "Kling",
              "Pika",
              "Suno",
              "ElevenLabs"
            ]
          }
        },
        "contentType": {
          "type": "string",
          "enum": [
            "web-app",
            "saas",
            "mobile",
            "game",
            "extension",
            "ai-service",
            "media",
            "other"
          ]
        },
        "targetDevice": {
          "type": "string",
          "enum": [
            "mobile",
            "desktop"
          ],
          "description": "Required. The screen this app was mainly designed for: \"mobile\" = phone screens (a narrow single column, a bottom tab bar, touch-first); \"desktop\" = computer browsers (wide layouts, sidebars, hover). If it works on both, pick the one it was designed for first. Not the same as contentType — a phone-first web app is contentType \"web-app\" with targetDevice \"mobile\". The owner's draft preview is framed as a phone or a desktop screen from this answer. The demo robot itself always films a 1280x720 desktop browser, so demoScript selectors must match the layout at that size."
        },
        "demoAccess": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string",
              "description": "Demo/guest entry URL or path (e.g. \"/demo\")"
            },
            "params": {
              "type": "object",
              "additionalProperties": {
                "type": "string"
              },
              "description": "Extra query parameters to append to the entry URL (e.g. {\"guest\":\"1\"})"
            },
            "note": {
              "type": "string",
              "description": "One or two sentences on how to reach demo mode there (max 500 chars). If impossible, why it is impossible"
            },
            "impossible": {
              "type": "boolean",
              "description": "Declares that a guest path is fundamentally impossible (E2E encryption, mandatory device pairing, etc.). If true, automatic filming captures only the landing page and says so in the report — attaching a video is recommended."
            },
            "noLogin": {
              "type": "boolean",
              "description": "Declares that no login is needed at all and every feature is usable from the first screen. Do not set it just because the landing page looks fine — only after checking the actual routes and guards."
            }
          }
        },
        "ownerInterview": {
          "type": "object",
          "description": "Required. After a quick look at the project (what it is, what works, whether there is anything to see), ask the OWNER these questions in the chat in plain everyday words — before you write the payload — and wait for their answers; never answer them yourself (placeholders like \"none\" or \"N/A\" are rejected). If the project is half-built or has nothing to see yet, say so first and ask whether to upload it now as a work in progress. Keep filming mechanics (robots, repos, logs, test data) out of this message — ask about those separately afterwards, in one plain sentence. A demo is not the real app, and only the person who built and uses it knows what matters. Put their own words here (max 300 characters each), then use them: open or linger on the proudMoment/mustSee scenes in demoScript, draw builderNote from howIUse (one line, in their voice), and keep any screen that shows a hide item out of the script. The answers are not printed on the public page, and hide stays private.",
          "properties": {
            "proudMoment": {
              "type": "string",
              "description": "The part of the app the owner most wants people to see — a screen, a feature or a result (a part of the app, not a moment in their life)"
            },
            "howIUse": {
              "type": "string",
              "description": "How the owner actually uses it: when, how often, what for — or, if they have not used it yet, what they built it for"
            },
            "mustSee": {
              "type": "string",
              "description": "The one thing a first-time viewer must notice"
            },
            "hide": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "(optional) Anything that must never be shown — people's names, amounts, places, health details (max 12 items, 80 characters each)"
            }
          },
          "required": [
            "proudMoment",
            "howIUse",
            "mustSee"
          ]
        },
        "language": {
          "type": "string",
          "enum": [
            "ko",
            "en"
          ],
          "description": "Required. The owner's language — the one title, description and builderNote are written in (the language the owner writes to you in). Every work also carries the other language in translation, and each visitor sees their own language's version."
        },
        "appLanguages": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "ko",
              "en"
            ]
          },
          "description": "Required. Which of ko/en the app's OWN screens can show — check the code (a language switch, i18n files, hard-coded text): [\"ko\"] for a Korean-only app, [\"ko\",\"en\"] if it has both, [] if neither. The robot films once per language listed; for each language missing, every demoScript step needs caption.<that language>. If English is missing, ask the owner before anything else: \"Should I add an English version of the app?\" — it means changing and redeploying their app, so it is their call. Yes → add it, deploy it, list both. No → write English captions. If only Korean is missing, do not ask — just write Korean captions."
        },
        "translation": {
          "type": "object",
          "description": "Required. The same title, description and builderNote in the OTHER language (en if language is ko, ko if it is en). Write it the way a native speaker would, not word for word. The description follows the same 2-3 line rule (52 columns per line at most).",
          "properties": {
            "title": {
              "type": "string",
              "description": "Product name as a reader of that language should see it (max 80 characters)"
            },
            "description": {
              "type": "string",
              "description": "2-3 lines separated by newlines"
            },
            "builderNote": {
              "type": "string",
              "description": "(optional) The one-liner in that language"
            }
          },
          "required": [
            "title",
            "description"
          ]
        },
        "introFilm": {
          "type": "object",
          "description": "Intro film for a work with NO screen worth filming — a CLI tool, backend, bot, hardware/IoT project, or an app locked behind a private access code. Instead of robot filming, Nookframe plays these scenes live on the card in one of its own motion styles, so send introFilm INSTEAD of demoScript/demoAccess (those gates are skipped, no deployUrl needed). Apps with a real screen must keep robot filming — do not use introFilm for them. You only fill text slots; layout, timing and animation are Nookframe's. Every on-screen text is { \"en\": \"...\", \"ko\": \"...\" } (both languages, the owner's meaning, short). Numbers must be honest: scenes that show numbers (hook, items, terminal, alert, stats) need data: \"sample\" (made-up example values — the film is labelled 'Sample data') or \"measured\" (real, with source: the file/log/doc it came from). Never present invented numbers as measured, and never put real people's names, addresses, room names, keys or private usage in a film. Write the story from the ownerInterview answers: why they built it (story/hook), what it does (flow/terminal/items), the moment they are proud of (alert/stats), then ending. 3–8 scenes, about 20–35 seconds total. Scene kinds and their fields — hook: { label, value (e.g. \"68%\", \"12,480\", ≤12 chars), alarm?, line }; story: { line, line2 }; items: { items: [{ value, label, alarm? }] ×2–6, line }; flow: { nodes: [label] ×2–5, line }; terminal: { command (≤60), output: [plain text lines] ×1–8, line }; alert: { title, body, line, line2 } (a phone notification + a headline); stats: { stats: [{ value (≤6), unit, label }] ×2–4, line }; ending: { line, line2, name }. Text limits: line ≤60, line2 ≤40–48, labels ≤20–40 characters; the server tells you the exact field if one is too long. style: send { \"text\": \"bignum\", \"mood\": \"cinematic\" } — Nookframe currently draws every intro film in this one polished look (bold numbers on a dark, cinematic stage), so do not promise the owner other looks.",
          "properties": {
            "style": {
              "type": "object",
              "properties": {
                "text": {
                  "type": "string",
                  "enum": [
                    "hand",
                    "bignum",
                    "cinematic"
                  ]
                },
                "mood": {
                  "type": "string",
                  "enum": [
                    "hand",
                    "bignum",
                    "cinematic"
                  ]
                }
              },
              "required": [
                "text",
                "mood"
              ]
            },
            "scenes": {
              "type": "array",
              "minItems": 3,
              "maxItems": 8,
              "items": {
                "type": "object",
                "properties": {
                  "kind": {
                    "type": "string",
                    "enum": [
                      "hook",
                      "story",
                      "items",
                      "flow",
                      "terminal",
                      "alert",
                      "stats",
                      "ending"
                    ]
                  },
                  "data": {
                    "type": "string",
                    "enum": [
                      "sample",
                      "measured"
                    ]
                  },
                  "source": {
                    "type": "string",
                    "description": "Where measured numbers came from (file, log, doc). Required when data is \"measured\"."
                  }
                },
                "required": [
                  "kind"
                ]
              }
            }
          },
          "required": [
            "style",
            "scenes"
          ]
        }
      },
      "required": [
        "id"
      ]
    }
  },
  {
    "name": "delete_nookframe_draft",
    "title": "Delete a draft",
    "annotations": {
      "title": "Delete a draft",
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": true,
      "openWorldHint": false
    },
    "description": "Delete a Nookframe draft (uploaded files included). Published projects cannot be deleted with this tool. Use it only when the user asked for the deletion, or for a draft uploaded by mistake.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Draft id (find it with list_nookframe_drafts)"
        }
      },
      "required": [
        "id"
      ]
    }
  }
];

/** tools/call이 받아주는 이름 전부 — 목록 밖 이름은 서버가 거절한다. */
export const MCP_TOOL_NAMES: string[] = MCP_TOOLS.map((t) => t.name);
