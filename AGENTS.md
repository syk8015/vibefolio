<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Trigger.dev (v4)

Hard rules (violating any of these breaks the app):

- Import from `@trigger.dev/sdk` only. NEVER use v2 `client.defineJob`.
- `triggerAndWait()` returns a Result object `{ ok, output, error }` — check `result.ok` before touching `result.output`.
- Never wrap `wait.*`, `triggerAndWait`, or `batchTriggerAndWait` in `Promise.all` / `Promise.allSettled`.

Before touching `src/trigger/*`, `trigger.config.ts`, or anything importing `@trigger.dev` (currently `app/api/projects/[id]/trigger-demo/route.ts` and `scripts/trigger-build.mjs`), read `docs/trigger-dev.md` — full v4 reference for tasks, queues/concurrency, debounce, retries, batch, waits, machines, idempotency, and metadata (plus the Realtime reference — unused in this repo).
