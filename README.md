# Beer Game

A multiplayer Beer Distribution Game for classrooms and workshops. Four players per team run a supply chain (Manufacturer → Distributor → Wholesaler → Retailer), place weekly orders, and try to keep team cost low while experiencing the Bullwhip Effect first-hand. Empty roles are filled by bots, and games run to completion on timers.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · [Neon](https://neon.com) (Postgres 18 + Realtime)

The game originates from [NarasimhaKamathB/Beer-game](https://github.com/NarasimhaKamathB/Beer-game) (baseline `afcdd91`, originally on Supabase) and is being improved here. See `CHANGELOG.md` for what changed.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in DATABASE_URL, NEON_REALTIME_URL, NEON_REALTIME_SECRET
npm run db:setup                   # applies db/schema.sql to your Neon database
npm run dev                        # http://localhost:3000
```

- Players: `/` (enter an email; role and team are assigned automatically)
- Facilitator: `/admin` (default password `beergame2026` — change it after first login)
- Projector view: `/observer`

Neon setup details (Postgres 18 and Realtime allowed origins are required) are in `STATUS.md`.

## How it works

- All database access happens in server-side API routes (`app/api/rpc`); the browser never holds a database credential.
- Every game command (submit order, process round, advance, start, pause…) is a single locked transaction, so a round is processed exactly once even if several clients fire at the same time.
- Live updates use Neon Realtime sealed queries (`app/api/realtime`), with a slow polling fallback because Realtime is in beta.

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Pages (player, lobby, game, results, admin, observer) and API routes |
| `components/` | UI components |
| `lib/` | Game logic, types, browser API client; `lib/server/` holds DB access and commands |
| `db/schema.sql` | Database schema (idempotent) |
| `docs/`, `DESIGN.md`, `STATUS.md` | Design notes and current status |

## Versions

Releases are git tags. The original Supabase version is `v0.1.0-supabase-baseline`; roll back with `git checkout v0.1.0-supabase-baseline`.
