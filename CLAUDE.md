# CLAUDE.md

This project is `baijiaxingFY`, the Node.js website MVP for “百家姓溯源录”.

## Project Scope

- Standalone Node.js website for Chinese surname culture search, AI Harness drafting, source accumulation, review workflow, feedback queue, and ops tooling.
- It is independent from `Fy-api`, `TraceNexBiz`, and `official-website`.
- Product name: `百家姓溯源录`.
- Primary runtime entry: `server.js`.
- Public app entry: `index.html`.

## Run And Verify

```bash
npm start
npm run verify:release
npm run verify:server
```

- `npm run verify:release` is the default pre-push gate.
- `npm run verify:server` starts a real localhost service and may need an environment that allows binding `127.0.0.1`.
- Runtime data files are intentionally ignored: `data/workspace.json`, `data/audit.log`, `data/feedback.jsonl`, and `data/backups/`.
- The committed data directory should only contain `data/seed-workspace.json` unless a deliberate seed-data update is requested.

## Development Rules

- Keep the project self-contained: no dependency on the gateway repos.
- Preserve the Node.js MVP shape unless the user explicitly asks for a framework migration.
- Use the existing verification scripts before claiming completion.
- For UI work, keep the dark tech + Chinese gold visual direction and verify real rendering when possible.
- Do not commit secrets, API keys, runtime workspaces, feedback queues, audit logs, or local `.env` files.
- Do not reintroduce the deferred chain/storage marketing terms that this MVP intentionally excludes for now.

## Important Files

- `README.md`: operating and deployment guide.
- `上线Review报告.md`: review log and verification evidence.
- `verify-release.mjs`: release gate.
- `verify-site.mjs`: static contract checks.
- `verify-ui.mjs`: frontend structure checks.
- `verify-server-logic.mjs`: no-port server behavior checks.
- `verify-server-auth.mjs`: admin-token behavior checks.
- `verify-server-production.mjs`: production config and storage checks.
- `verify-server.mjs`: real HTTP server integration checks.

