# Event-Q&A

> Self-hosted Q&A and discussion companion for events and conferences.

Event-Q&A displays the program of an event (tracks, talks, rooms,
speakers) and lets attendees ask and discuss questions per talk,
browse other attendees, and exchange direct messages. To run an event,
the admin writes a single `event.yaml` describing the schedule and
launches the tool on a server. Participants connect from any device
using a self-chosen alias.

## Features

- **Schedule view** — timeline grid on desktop, chronological list on
  mobile, grouped by track and day.
- **Per-talk Q&A** — attendees post questions, upvote them, and
  discuss in a flat chatroom under each question.
- **Direct messages** — simple two-party chat between any two
  attendees.
- **Lightweight auth** — claim an alias on first visit; optional
  password to protect it across devices.
- **Admin moderation** — hide questions/messages, mark questions as
  answered, ban or rename users.
- **Realtime updates** — new questions, votes, replies and DMs arrive
  over WebSocket without reload.
- **Dark mode** — follows OS preference, with a per-user override.
- **Single config file** — everything (schedule, rooms, speakers,
  admins) lives in one `event.yaml`.
- **Single container** — backend, frontend and SQLite are served by
  one Docker image; one mounted volume holds all state.

## Quick start

Requires Docker and Docker Compose.

```bash
# 1. Clone the repo and copy the example config
git clone https://github.com/c4dt/event-qa.git
cd event-qa
cp event.example.yaml event.yaml
$EDITOR event.yaml

# 2. Start the stack
docker compose up -d

# 3. Put a TLS-terminating proxy (traefik, Caddy, nginx) in front of
#    port 3000.
```

The server listens on port `3000` and stores state in `./data`
(`event.yaml` and the SQLite database).

To generate an argon2id password hash for an admin entry:

```bash
docker run --rm -it ghcr.io/c4dt/event-qa hash-password
```

## Configuration

The admin maintains a single yaml file, `event.yaml`, mounted into the
container at `/data/event.yaml`. A minimal example:

```yaml
event:
  name: "My Conference 2026"
  place: "EPFL, Lausanne"
  start: 2026-06-01
  end:   2026-06-02
  info: |
    Welcome to the conference. Wi-Fi: guest / hunter2.

rooms:
  - id: main
    name: "Main Hall"
    description: "Ground floor, capacity 300"
  - id: bh1
    name: "Breakout 1"

speakers:
  - id: ada
    name: "Ada Lovelace"
    bio: "Mathematician, programmer."

admins:
  - alias: admin
    password: "$argon2id$..."   # see "Quick start" for how to hash

tracks:
  - id: main-track
    name: "Main Track"
    talks:
      - id: opening
        title: "Opening keynote"
        start: 2026-06-01T09:00:00+02:00
        duration_min: 45
        speakers: [ada]
        room: main
        # qa: true     # optional, default true. Set to false for breaks/socials.

      - id: lunch
        type: slot      # non-talk entry: no speaker, no Q&A
        title: "Lunch"
        start: 2026-06-01T12:00:00+02:00
        duration_min: 90
        room: main
```

The config is loaded once at server startup; to change it, edit the
file and restart the container. The full schema and validation rules
are documented in
[TECHNICAL.md](./TECHNICAL.md#eventyaml-format).

A complete sample is available at
[`event.example.yaml`](./event.example.yaml).

## Development

All tooling (Node, pnpm, sqlite, argon2 CLI) is pinned via
[devbox](https://www.jetify.com/devbox/) — do not rely on
system-installed Node or pnpm.

```bash
# Enter the devbox shell
devbox shell

# Install workspace dependencies
pnpm install

# Run backend (:3000) and frontend (:5173) dev servers
pnpm dev

# Run tests (red/green TDD)
pnpm test
```

Outside the devbox shell, prepend every command with `devbox run --`.
See [TECHNICAL.md](./TECHNICAL.md#development) for more details on the
toolchain, the repository layout, and the test strategy.

## Documentation

- [USER_GUIDE.md](./USER_GUIDE.md) — what attendees and admins see and
  do (login, schedule, Q&A, DMs, moderation).
- [TECHNICAL.md](./TECHNICAL.md) — architecture, data model, HTTP and
  WebSocket APIs, deployment, security notes.
- [`event.example.yaml`](./event.example.yaml) — annotated config
  sample.

## Tech stack

| Layer       | Choice                                                 |
|-------------|--------------------------------------------------------|
| Backend     | Node.js (>=20) + Express + TypeScript                  |
| Realtime    | WebSockets via `ws`                                    |
| Frontend    | SvelteKit + TypeScript + Tailwind CSS                  |
| Persistence | SQLite via `better-sqlite3`                            |
| Passwords   | `argon2` (argon2id)                                    |
| Config      | YAML (`js-yaml`) validated with `zod`                  |
| Container   | Single multi-stage Dockerfile, run via docker-compose  |
| Tests       | `vitest` for both backend and frontend                 |

## Contributing

Issues and pull requests are welcome. Before opening a PR:

- Read [TECHNICAL.md](./TECHNICAL.md) to understand the architecture.
- Run `pnpm lint` and `pnpm test` from the devbox shell.
- For backend logic (auth, rate limiting, admin actions), follow
  red/green TDD: write the failing test first, then the code.

## License

Licensed under the GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later). See [LICENSE](./LICENSE) for the full text.
