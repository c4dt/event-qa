# Technical Description

This document is the **build spec** for Event-Q&A. Combined with
[README.md](./README.md) (which describes user-facing behaviour) it is
the complete plan; no additional planning document is expected.

## Tech stack

| Layer       | Choice                                          |
|-------------|-------------------------------------------------|
| Backend     | Node.js (>=20) + Express + TypeScript           |
| Realtime    | WebSockets via `ws`                             |
| Frontend    | SvelteKit + TypeScript + Tailwind CSS           |
| Persistence | SQLite (file mounted in a volume) via `better-sqlite3` |
| Passwords   | `argon2` (argon2id)                             |
| Config      | YAML (`js-yaml`) validated with `zod`           |
| Tooling     | devbox (Node, pnpm, sqlite, argon2 CLI)         |
| Container   | Single multi-stage Dockerfile, served via docker-compose |
| Tests       | `vitest` for both backend and frontend          |

Everything runs in one container. SvelteKit is built as a static SPA
and served from Express; the SPA talks to the backend over HTTP+WS on
the same origin. No separate frontend service.

## Repository layout

```
event-qa/
├── README.md
├── TECHNICAL.md
├── devbox.json
├── docker-compose.yaml
├── Dockerfile
├── event.example.yaml
├── package.json            # workspace root
├── pnpm-workspace.yaml
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # entry, loads config, starts server
│   │   ├── config.ts           # yaml load + zod schema
│   │   ├── db.ts               # sqlite init + migrations
│   │   ├── auth.ts             # alias claim, tokens, password
│   │   ├── http/               # Express routers
│   │   │   ├── auth.ts
│   │   │   ├── schedule.ts
│   │   │   ├── users.ts
│   │   │   ├── questions.ts
│   │   │   ├── dms.ts
│   │   │   └── admin.ts
│   │   ├── ws/                 # WebSocket hub
│   │   │   └── hub.ts
│   │   ├── presence.ts         # alias liveness tracking
│   │   ├── ratelimit.ts
│   │   └── util/
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── svelte.config.js
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── app.html
│   │   ├── lib/
│   │   │   ├── api.ts          # HTTP wrapper
│   │   │   ├── ws.ts           # WebSocket client + store
│   │   │   ├── stores/
│   │   │   ├── components/
│   │   │   └── types.ts        # mirrors backend zod types
│   │   └── routes/
│   │       ├── +layout.svelte
│   │       ├── +page.svelte                # Landing (schedule)
│   │       ├── login/+page.svelte
│   │       ├── talks/[talkId]/+page.svelte
│   │       ├── questions/[questionId]/+page.svelte
│   │       ├── users/+page.svelte
│   │       ├── users/[alias]/+page.svelte
│   │       ├── dm/[alias]/+page.svelte
│   │       └── profile/+page.svelte
│   └── tests/
└── .github/workflows/
    ├── ci.yaml
    └── publish.yaml
```

## Development

### Devbox

All binaries and libraries (Node, pnpm, sqlite, argon2 CLI) are pinned
through [devbox](https://www.jetify.com/devbox/). The repo's
`devbox.json` is the single source of truth — do **not** rely on
system-installed Node or pnpm.

```bash
# One-time: install devbox (see https://www.jetify.com/devbox/docs/installing_devbox/)

# Enter the devbox shell (sets $DEVBOX_SHELL_ENABLED, puts tools on PATH)
devbox shell

# Or run a single command without entering the shell
devbox run -- pnpm install
devbox run -- pnpm test
```

Inside the devbox shell, commands are run directly (`pnpm install`).
Outside it, prepend every command with `devbox run --`. CI workflows
and the Dockerfile must use the same devbox-managed toolchain to keep
local and CI builds reproducible.

To add a new tool: `devbox search <name>` then `devbox add <name>`;
commit the updated `devbox.json` and `devbox.lock`.

### Common commands

```bash
# Install workspace deps
pnpm install

# Run backend + frontend dev servers
pnpm dev          # backend on :3000, frontend on :5173 (proxies /api, /ws → :3000)

# Tests (TDD: write the test first, then the code)
pnpm test         # runs vitest in both workspaces
pnpm test:watch

# Lint and format
pnpm lint
pnpm format
```

A sample config lives at `event.example.yaml`. Point the backend at it
with `EVENT_CONFIG=./event.example.yaml pnpm --filter backend dev`.

### Test-driven development

Use red/green TDD for backend logic (auth flow, alias claim/expiry,
rate limiting, upvote toggling, admin actions, DM access checks).
Frontend tests cover stores and any non-trivial component logic;
end-to-end Playwright tests are out of scope for v1.

## Configuration

### `event.yaml` format

Loaded once at server startup from `EVENT_CONFIG` (default
`/data/event.yaml`). The file is validated with `zod`; an invalid file
makes the server refuse to start with a clear error.

```yaml
event:
  name: string                  # required
  place: string                 # required
  start: date (YYYY-MM-DD)      # required
  end:   date (YYYY-MM-DD)      # required
  info:  string (markdown)      # optional
  timezone: string              # optional, IANA tz, default "UTC"

rooms:
  - id: string                  # unique slug
    name: string
    description: string         # optional

speakers:
  - id: string                  # unique slug
    name: string
    bio: string                 # optional, markdown
    affiliation: string         # optional

admins:
  - alias: string               # must NOT collide with regular user aliases
    password: string            # argon2id hash, see "Hashing passwords"

tracks:
  - id: string
    name: string
    talks:
      - id: string              # unique across the whole event
        type: "talk" | "slot"   # optional, default "talk"
        title: string
        description: string     # optional, markdown
        start: ISO 8601 datetime with tz
        duration_min: integer (>0)
        speakers: [speakerId]   # required for talks, must be empty/absent for slots
        room: roomId            # required
        qa: bool                # optional, default true (must be false for slots)

ratelimit:
  posts_per_minute: int         # optional, default 10
```

Validation rules enforced at load time:
- All `roomId` / `speakerId` / `trackId` references resolve.
- Admin aliases are unique and lowercase.
- No two talks in the same room overlap in time.
- `slot` entries have `speakers: []` and `qa: false`.

### Hashing passwords

The Docker image ships a small CLI: `event-qa hash-password`. It
prompts for a password and prints the argon2id hash to paste into the
yaml.

```bash
docker run --rm -it ghcr.io/c4dt/event-qa hash-password
```

### Environment variables

| Var            | Default              | Purpose                                |
|----------------|----------------------|----------------------------------------|
| `EVENT_CONFIG` | `/data/event.yaml`   | Path to the event yaml                 |
| `DB_PATH`      | `/data/event-qa.db`  | SQLite file                            |
| `PORT`         | `3000`               | HTTP port                              |
| `LOG_LEVEL`    | `info`               | `debug` / `info` / `warn` / `error`    |
| `SESSION_TTL`  | `30d`                | Session token lifetime                 |

## Data model

SQLite. Migrations run at startup; the schema lives in `backend/src/db.ts`.

```sql
-- A user is a row created the first time an alias is claimed.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  alias         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,                            -- NULL = passwordless
  name          TEXT,
  affiliation   TEXT,
  bio           TEXT,
  created_at    INTEGER NOT NULL,
  banned        INTEGER NOT NULL DEFAULT 0,     -- admin can ban
  is_admin      INTEGER NOT NULL DEFAULT 0     -- mirrors event.yaml at startup
);

CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,                 -- random 32 bytes hex
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL                  -- bumped on every request / ws ping
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Questions belong to a talk (talk_id is a string from event.yaml; not a FK).
CREATE TABLE questions (
  id          INTEGER PRIMARY KEY,
  talk_id     TEXT NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,       -- admin hide
  answered    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX questions_talk ON questions(talk_id);

CREATE TABLE question_messages (
  id           INTEGER PRIMARY KEY,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_id    INTEGER NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  hidden       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX qm_question ON question_messages(question_id);

CREATE TABLE upvotes (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, user_id)
);

-- DMs: one row per message; the (low, high) pair of user ids identifies the conversation.
CREATE TABLE dm_messages (
  id          INTEGER PRIMARY KEY,
  user_a      INTEGER NOT NULL REFERENCES users(id),  -- always min(sender, recipient)
  user_b      INTEGER NOT NULL REFERENCES users(id),  -- always max(sender, recipient)
  sender_id   INTEGER NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX dm_pair ON dm_messages(user_a, user_b, created_at);

-- Tracks the last time a user "read" something, for unread badges.
CREATE TABLE read_markers (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                    -- 'dm' | 'question'
  ref         TEXT NOT NULL,                    -- peer user id (dm) or question id
  last_read   INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, ref)
);

-- A user automatically "watches" any question they opened or posted in.
CREATE TABLE watches (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, question_id)
);
```

Admin accounts in `event.yaml` are synced into `users` at startup
(creating the row if missing, updating `is_admin=1` and password). An
admin alias collision with an existing regular user takes over the row
(its `is_admin` flips to 1) — operators are responsible for picking
admin aliases that won't surprise attendees.

## Authentication & alias claiming

Aliases are case-insensitive. The flow:

1. `POST /api/auth/login {alias, password?}`
   - If `alias` exists and is an admin → password required, verified.
   - If `alias` exists with password → password required, verified.
     A successful login mints a new session token; the existing one is
     **not** invalidated (multi-device).
   - If `alias` exists without password →
     - If a session for that user has `last_seen` within 60s → reject
       with `409 alias_busy` (someone is using it without a password).
     - Else: claim succeeds, a new session token is minted, **all
       previous sessions for that user are invalidated** (the previous
       owner is logged out).
   - If `alias` doesn't exist → create user, mint session. The
     optional `name`/`affiliation`/`bio`/`password` from the request
     body are stored on the new user.

2. The server returns `{token, user}`; the client stores `token` and
   `alias` in `localStorage`.

3. Every HTTP request sends `Authorization: Bearer <token>`. WebSocket
   sends the token in the first message after connection. The server
   bumps `last_seen` on each request and each WS ping (every 20s).

4. `POST /api/auth/logout` deletes the current session row only.

5. `PATCH /api/me` lets the user edit `name`, `affiliation`, `bio`,
   and rename the alias (subject to the same collision rules; renames
   never break authorship because IDs are stable).

Banned users (`banned=1`) get `403` on every authenticated endpoint.

## HTTP API

All paths under `/api`. JSON in/out. Auth via `Authorization: Bearer`.

| Method | Path                                  | Purpose                                    |
|--------|---------------------------------------|--------------------------------------------|
| POST   | `/api/auth/login`                     | Claim/login as described above             |
| POST   | `/api/auth/logout`                    | Drop current session                       |
| GET    | `/api/me`                             | Current user object                        |
| PATCH  | `/api/me`                             | Update profile (incl. alias, password)     |
| GET    | `/api/event`                          | Static event metadata (name, place, info)  |
| GET    | `/api/schedule`                       | Tracks, talks, rooms, speakers             |
| GET    | `/api/users`                          | Users list with counts and `last_seen`     |
| GET    | `/api/users/:alias`                   | One user's public profile + activity       |
| GET    | `/api/talks/:talkId/questions`        | Questions for a talk (with vote counts)    |
| POST   | `/api/talks/:talkId/questions`        | Create a question (also auto-watches)      |
| GET    | `/api/questions/:id`                  | One question with all its messages         |
| POST   | `/api/questions/:id/messages`         | Post a message (also auto-watches)         |
| POST   | `/api/questions/:id/upvote`           | Toggle the caller's upvote                 |
| POST   | `/api/questions/:id/read`             | Mark as read (clears badge)                |
| GET    | `/api/dm/:alias`                      | DM history with peer                       |
| POST   | `/api/dm/:alias`                      | Send DM                                    |
| POST   | `/api/dm/:alias/read`                 | Mark DM thread as read                     |
| GET    | `/api/unread`                         | `{dms: {alias: count}, questions: {id: count}}` |
| DELETE | `/api/admin/questions/:id`            | Admin: hide question                       |
| DELETE | `/api/admin/messages/:id`             | Admin: hide message                        |
| POST   | `/api/admin/questions/:id/answered`   | Admin: toggle answered flag                |
| POST   | `/api/admin/users/:alias/ban`         | Admin: toggle ban                          |
| PATCH  | `/api/admin/users/:alias`             | Admin: rename                              |

## Realtime (WebSocket)

`GET /ws` upgrades to a WebSocket. First client message is
`{type:"auth", token}`. After that, the server pushes events the
client cares about:

```
{type:"question.new",      talkId, question}
{type:"question.update",   question}            # vote count, answered, hidden
{type:"question.message",  questionId, message}
{type:"dm.new",            peerAlias, message}
{type:"user.update",       user}                # alias/profile change
{type:"presence",          alias, online: bool} # for users list
```

Clients can send `{type:"subscribe", channel:"talk:<id>"}` /
`{type:"unsubscribe", ...}` to control which streams they receive.
Every client implicitly subscribes to `dm:<self>` and `user:self`.

The server tracks a per-connection last-pong timestamp. If no traffic
for 30s it sends a ping; no reply within another 10s closes the
socket. Presence (used for both the users list and alias-busy logic)
is derived from any active session whose `last_seen` is within 60s.

## Rate limiting

Implemented in `ratelimit.ts` as a per-user token bucket in memory.
Default: `posts_per_minute = 10`, applied to the sum of
question-creates + question-messages + DMs. Returns `429
rate_limited` with a `Retry-After` header. Bucket size and refill rate
are read from `event.yaml`.

Upvote toggling is not rate-limited beyond preventing self-DoS via the
DB (idempotent UPSERT/DELETE).

## Frontend notes

- **Routing**: SvelteKit routes mirror the URLs in the layout table
  above. A root `+layout.svelte` enforces "logged in" (redirects to
  `/login` if no token) and renders the header (event name, users
  icon, badges, profile menu).
- **State**: one Svelte store per top-level concern (`auth`,
  `schedule`, `unread`, `presence`, `dm:<alias>`,
  `question:<id>`). The WS client dispatches into these stores.
- **Schedule view**: Tailwind `lg:grid` for the timeline grid on
  desktop, switching to a single chronological list at small
  breakpoints (`< lg`). Time slots use a CSS grid where each talk has
  `grid-column: <trackIndex+1>` and `grid-row: span <durationSlots>`.
- **Dark mode**: Tailwind `darkMode: 'class'`. Default to OS
  preference via a tiny inline script in `app.html`; the profile menu
  toggles a `localStorage` override.
- **Markdown rendering**: `marked` + `DOMPurify` for `info`, `bio`,
  and talk descriptions. User-posted messages (questions, replies,
  DMs) are rendered as plain text with URLs auto-linked — no markdown
  for user content (keeps moderation simpler).
- **Optimistic UI**: upvote toggle and message send update the store
  immediately and reconcile on server ack / WS broadcast.

## Deployment

```yaml
# docker-compose.yaml
services:
  event-qa:
    image: ghcr.io/c4dt/event-qa:latest
    restart: unless-stopped
    volumes:
      - ./data:/data        # holds event.yaml and event-qa.db
    environment:
      EVENT_CONFIG: /data/event.yaml
      DB_PATH: /data/event-qa.db
    ports:
      - "127.0.0.1:3000:3000"
```

Put a TLS-terminating proxy in front (traefik, Caddy, nginx). Proxy
config is out of scope for this repo.

### Dockerfile

Multi-stage:
1. `node:20-alpine` builds backend + frontend with pnpm.
2. Runtime stage copies built artefacts, prunes dev deps, sets a
   non-root user, runs `node backend/dist/index.js`.
3. The `hash-password` CLI is the same binary with a subcommand.

Persistent state: just the `/data` volume. SQLite is opened with
`PRAGMA journal_mode=WAL` for concurrent reads while the server writes.

## CI/CD (GitHub Actions)

Two workflows under `.github/workflows/`:

### `ci.yaml` — on every push and PR

- Set up Node 20 and pnpm.
- `pnpm install --frozen-lockfile`.
- `pnpm lint` (ESLint + Prettier `--check` + `svelte-check`).
- `pnpm test` (vitest in both workspaces).
- Fails the job on any error.

### `publish.yaml` — on push to `main`

- Build the multi-stage Dockerfile.
- Tag as `ghcr.io/c4dt/event-qa:latest` and
  `ghcr.io/c4dt/event-qa:<short-sha>`.
- Push to GHCR using `GITHUB_TOKEN`.
- Single-arch (`linux/amd64`) for v1; multi-arch can be added later.

Tag-based releases (e.g., `v1.2.3`) are out of scope for v1 and can be
added by extending `publish.yaml` to also push `:1.2.3`.

## Security notes

- All passwords are stored as argon2id hashes.
- Session tokens are 32 random bytes, base64-url encoded.
- DMs are server-side access-controlled: only `user_a` and `user_b`
  can read them via the API. Admins **cannot** read DMs via the UI
  (they can technically inspect the SQLite file on the host — this is
  documented as a known limitation, not a feature).
- The user's input (questions, messages, DMs, profile fields) is
  always rendered as text (escaped) in the frontend. Markdown is
  rendered only for fields that come from `event.yaml` (trusted) or
  `bio` (sanitized via DOMPurify).
- No external requests are made from the server.

## What is intentionally **not** in scope for v1

- Email or push notifications (only in-app badges).
- File or image uploads in questions/DMs.
- End-to-end encryption of DMs.
- Live editing of `event.yaml` from the UI.
- Multi-event support — one deployment serves one event.
- Internationalization — English only.
