#!/usr/bin/env node
import { publishCommand } from "../src/publish.js";
import { saveToken, getOrigin } from "../src/config.js";

const HELP = `nookframe — publish a vibe-coded project to Nookframe in one command

Commands:
  publish            Upload the current project as a draft (the AI that built it writes the metadata)
    --url <url>        Deployed public URL (falls back to auto-detecting dist/out/build/public)
                        If it needs a server/DB and --dir won't do, a public GitHub repo URL also works
                        (last resort: JS/Python web apps are run automatically, CLI/bots are filmed in a live terminal)
    --app-url <url>    URL of the actual app screen (when it differs from the landing page — the demo films this one)
    --dir <path>       Directory to upload (static build output, or Python/CLI source — uploaded as a zip)
    --title <t>        Title
    --description <t>  One-paragraph description
    --note <text>      Short one-liner shown in the speech bubble on the public card (builderNote)
    --hint <text>      What the demo video should show (demoHighlights)
    --access-url <u>   Demo/guest entry URL or path for login-gated apps (e.g. /demo)
    --access-params <q> Query string to append to the entry URL (e.g. "guest=1&lang=ko")
    --access-note <t>  One or two sentences on how to reach demo mode (no account credentials — they are rejected)
    --access-impossible  Declare that there is no way to see the app without login/pairing (E2E encryption, etc.)
                        Only the landing page gets filmed, so attach --video/--screenshot and explain in --access-note
    --screenshot <p>   Screenshot image for the thumbnail (png/jpg/webp/gif, <=5MB)
    --video <p>        Your own demo video (mp4/webm, <=20MB — supplying one skips automatic filming)
    --json '<payload>' Full payload JSON written by the AI (merged with other flags; JSON wins)
    --origin <url>     API origin (default ${getOrigin()})
  rerecord <id>      Unhappy with the video — submit a rewritten demo script
                     (it goes into a pending slot; the owner must review it and press [Re-record] in the dashboard)
    --json '<json>'    New script JSON — { "steps": [...] } or { "demoScript": {...}, "note": "..." }
    --file <path>      Same JSON, read from a file
    --note <text>      One line on what changed and why
  drafts             List your drafts (running publish again with the same URL updates the existing draft)
    update <id>        Edit draft metadata (--title/--description/--note/--hint/--json — to swap the URL or files, run publish again)
    delete <id>        Delete a draft (published projects cannot be deleted with this command)
  login <token>      Save a token to ~/.nookframe/config.json
  mcp                Run the MCP stdio server (for Claude Desktop, Cursor, etc.)

Get a token: nookframe.com/dashboard -> Connect tab. Then set NOOKFRAME_TOKEN or run login.`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      // 같은 플래그를 두 번 주면 조용히 마지막 값만 남던 문제(피드백 B-1):
      // 덮어쓰기 전에 경고한다. --screenshot 2장 같은 조용한 유실 방지.
      if (key in out) {
        console.error(`⚠️ --${key} was given more than once — only the last value is used.`);
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
        console.error("Usage: npx nookframe login <token>  (get a token at nookframe.com/dashboard -> Connect tab)");
        process.exit(1);
      }
      saveToken(token);
      console.log("✓ Token saved to ~/.nookframe/config.json");
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
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
