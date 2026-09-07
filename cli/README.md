# nookframe

CLI + MCP server that publishes your vibe-coded project to [Nookframe](https://nookframe.com) **in one command**.
The **AI that built your project** reads the repo and writes the description, the intent, and the **demo script** for you.

## Quick start

1. Create a token in `nookframe.com/dashboard → Connect` and put it in an env var:
   ```bash
   export NOOKFRAME_TOKEN="nf_live_..."   # or: npx nookframe login <token>
   ```
2. Tell the AI that built the project (Claude Code, Cursor, …): **"publish this to Nookframe"**
   It writes the metadata and runs:
   ```bash
   npx nookframe publish --json '<payload the AI wrote>'
   ```

## Commands

```
nookframe publish            Upload the current project as a draft
  --url <url>                Deployed public URL (falls back to auto-detecting dist/out/build/public)
                             A public GitHub repo URL also works — JS and Python web apps (Streamlit,
                             Gradio, Dash, Django, Flask, FastAPI) are run automatically; CLI tools and
                             bots are filmed in a live terminal
  --app-url <url>            URL of the actual app screen (when it differs from the landing page — the demo films this one)
  --dir <path>               Directory to upload (static build output, or Python/CLI source — uploaded as a zip)
  --title <t>                Title
  --hint <text>              What the demo video should show (demoHighlights) — the demo script goes in --json as demoScript
  --access-url <u>           Demo/guest entry URL or path for login-gated apps (e.g. /demo)
  --access-params <q>        Query string to append to the entry URL (e.g. "guest=1&lang=ko")
  --access-note <t>          One or two sentences on how to reach demo mode (account credentials are not accepted)
  --access-no-login          No login needed at all; every feature is usable from the first screen
  --access-impossible        A guest path is fundamentally impossible (E2E encryption, device pairing, …)
                             ↑ demoAccess is REQUIRED — without one of these three the server rejects with 400.
                               The filming robot never logs in, so judge not "does a screen appear" but
                               "what actually works before login"
  --screenshot <p>           Screenshot for the thumbnail (png/jpg/webp/gif, <=5MB)
  --video <p>                Your own demo video (mp4/webm, <=20MB — supplying one skips automatic filming)
  --json '<payload>'         Full payload JSON written by the AI
  --origin <url>             API origin (default https://nookframe.com)
nookframe rerecord <id>      Unhappy with the video — submit a rewritten demo script (goes into a pending slot)
  --json '<json>'            { "steps": [...] } or { "demoScript": {...}, "note": "..." }
  --file <path>              Same JSON, from a file
  --note <text>              One line on what changed and why
nookframe drafts             List your drafts
nookframe drafts update <id>  Edit draft metadata (--title/--description/--note/--hint/--json)
nookframe drafts delete <id>  Delete a draft (published projects cannot be deleted)
nookframe login <token>      Save a token (~/.nookframe/config.json)
nookframe mcp                Run the MCP stdio server
```

## The demo script (demoScript)

Once you publish, a robot operates the app itself and films a demo video. **Do not leave it guessing from
pixels** — have the AI that built the app put a `demoScript` in the `--json` payload. That script is the
whole video.

```json
{
  "title": "Todo Sketch",
  "demoScript": {
    "steps": [
      { "goal": "adding a todo is the core", "selector": "#new-todo", "action": "type", "text": "buy milk", "expect": "the item appears in the list" },
      { "goal": "reorder by dragging", "selector": ".todo:first-child", "toSelector": ".todo:last-child", "action": "drag", "hold": 2 },
      { "goal": "highlight the completion stats", "selector": ".stats", "action": "focus" }
    ],
    "skip": ["dark mode toggle"]
  }
}
```

- **5-8 steps is right (min 4, max 10), in order of importance** — the film runs ~30s and is cut from the end.
- Give a `selector` (CSS selector) on **every step** and the robot builds the run straight from the DOM instead of exploring the screen — faster and more accurate.
- `action`: `click` · `type` · `drag` · `scroll` · `hover` · `draw` · `focus` (no interaction; the camera zooms into that area).
- Put `action` **and** `selector` (or `where`, if you do not know the selector) on every step — a step with only a `goal` is a table of contents, and the server rejects a script made only of those (at least 3 steps must meet this bar).
- `hold` (0.5-4s): holds that step's result on screen for beats that need a slow look.
- Even if the script asks, the robot **never presses login, submit, delete, or file-picker controls.**
- The publish result carries a **script check** line — step count, how many steps actually operate the app, how many carry a selector and an expect, plus the result of the server fetching the entry URL's HTML once to count **whether the selectors really exist**. Fix the lines marked `⚠` and publish again with the same URL to update the draft.
  (The server cannot see JavaScript-rendered screens, so in that case it tells you to check in a browser yourself.)

Uploaded work lands as a **draft**. Review and edit it in the dashboard, and the automatic demo video is filmed
when you publish. Running `publish` again with the same URL does not create a new draft — it **updates the
existing one**.

## Re-recording (rerecord)

If the video is not right, **the human writes the complaint in words and the AI rewrites the script.** Nobody has
to hand-edit CSS selectors.

1. The owner presses `⋯ → Request re-record` in the Nookframe dashboard and writes what is wrong — *"don't click that at 0:16"*, *"this feature is missing"*.
2. The site builds **one prompt**. It contains the full original script, the project details, the project id, and the token, so it works even pasted into a fresh AI session with no memory of the repo.
3. That AI submits the new script:
   ```bash
   npx nookframe rerecord <project id> --json '{"demoScript": {...}, "note": "what changed and why"}'
   ```
4. Filming starts only after the owner reviews the new script in the dashboard and presses **[Re-record]**.

> Submitting alone changes nothing. The published script (`demo_script`) stays put and the new one is stored in a
> **pending slot**, so a token cannot overwrite public content and a human looks once before any filming cost is
> incurred. The AI must tell the human that filming has **not** started yet.

## MCP (Claude Desktop · Cursor)

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

Exposes `publish_to_nookframe` · `rerecord_nookframe_demo` · `list_nookframe_drafts` · `update_nookframe_draft` · `delete_nookframe_draft`.
Three of them (`publish_to_nookframe`, `rerecord_nookframe_demo`, `update_nookframe_draft`) take the `demoScript` schema above as-is.
`rerecord_nookframe_demo` is the only tool that works on an **already published** work — and even there the new script is only stored as pending (see above).
