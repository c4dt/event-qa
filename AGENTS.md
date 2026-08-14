# Simple commands

Here are a number of commands and what you should do.
Only execute these commands if they are on a simple line without
anything else.

- todo: go through the TODO.md list. Choose the topmost entry, check if
  there are other entries which should be done at the same time, then
  work on them. Once you're done, move these entries from the `# TODO`
  section to the `# DONE` section of TODO.md, commit the changes, and
  then go back to the first remaining entry in the TODO list.
  (`DONE.md` is a legacy changelog from before TODO.md grew its own
  `# DONE` section — it is no longer updated; don't write to it.)

# Toolchain

This repo is devbox-managed (`devbox.json`): Node, pnpm, and sqlite are
pinned there — never assume a system-installed Node/pnpm. If
`$DEVBOX_SHELL_ENABLED` is not set, ask the user to run in `devbox
shell` rather than working around it.

pnpm workspace with two packages, `backend` (Express + TypeScript) and
`frontend` (SvelteKit + TypeScript + Tailwind). Root scripts fan out
with `pnpm -r`: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm format`.
Backend also has `pnpm --filter @event-qa/backend typecheck`
(`tsc --noEmit`) — CI runs this before tests.

Architecture, data model, HTTP/WS API, and deployment are documented in
[TECHNICAL.md](./TECHNICAL.md) — treat it as the build spec and keep it
in sync when behaviour changes; don't duplicate it here.

# Code conventions

- TypeScript `strict` + `noUncheckedIndexedAccess` in both packages.
  Use `import type { ... }` for type-only imports.
- Request bodies are validated with `zod` `.safeParse()` at the top of
  the handler; on failure respond `400 { error: 'invalid_body', issues
  }`. Other error responses are `{ error: 'snake_case_code' }` (e.g.
  `not_found`, `forbidden`, `rate_limited`, `unauthorized`) — keep new
  endpoints consistent with this shape.
- Express handlers run after `requireAuth`, so `req.ctx!` and
  `req.user!` non-null assertions are the norm inside route handlers —
  no need to re-check auth per handler.
- WebSocket pushes go through a small `broadcast(channel, payload)`
  closure per router; channel names are `talk:<id>`, `question:<id>`,
  `dm:<alias>`, `user:<alias>`.
- No unused vars (`argsIgnorePattern: '^_'` for intentionally-unused
  args/params). `no-console` is allowed in the backend.
- Formatting is prettier-owned (single quotes, trailing commas,
  100-char width) — run `pnpm format` rather than hand-wrapping lines.

# Testing

- `vitest` in both packages. Backend HTTP tests use `supertest` against
  `createApp(...)` with an in-memory DB (`openDb(':memory:')`) reset in
  `beforeEach`.
- Backend logic (auth, alias claim/expiry, rate limiting, upvote
  toggling, admin actions, DM access checks) follows red/green TDD:
  write the failing test first.
- Frontend tests cover stores and non-trivial component logic only;
  Playwright/e2e is explicitly out of scope for v1 (see TECHNICAL.md).

# Commits

Recent history favours a short imperative subject line (no
`type(scope):` prefix) and, when the change isn't self-explanatory, a
one-paragraph body describing what changed and why — see `git log` for
examples. Prefer this over conventional-commit prefixes for new work in
this repo.
