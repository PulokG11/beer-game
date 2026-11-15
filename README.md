# Beer Game

A multiplayer Beer Distribution Game for classrooms and workshops. Four players per team run a supply chain (Manufacturer → Distributor → Wholesaler → Retailer), place weekly orders, and try to keep team cost low while experiencing the Bullwhip Effect first-hand. Empty roles are filled by bots, and games run to completion on timers.

**Live:** https://pulokg11.github.io/beer-game/  
**Stack:** Next.js 15 (static export) · TypeScript · Tailwind CSS · [Neon](https://neon.com) (Postgres 18 + Realtime + a Neon Function as the API) · GitHub Pages + GitHub Actions

The game originates from [NarasimhaKamathB/Beer-game](https://github.com/NarasimhaKamathB/Beer-game) (baseline `afcdd91`, originally on Supabase) and is being improved here. See `CHANGELOG.md` for what changed.

## Architecture

```
Browser (GitHub Pages, static)  ──HTTPS──▶  Neon Function "api"  ──▶  Neon Postgres 18
        ▲                                   POST /rpc, /realtime
        └───── Neon Realtime (WebSocket, server-sealed live queries) ──┘
```

- The site is a static export; it holds no database credential.
- All game logic runs in the Neon Function (`functions/api`, code in `lib/server/`). Every command is one locked transaction, so a round is processed exactly once even when several clients fire at once.
- Live updates use Neon Realtime (beta) with a slow polling fallback.
- Pages use `?id=` query strings instead of dynamic routes (required for static export).

## Deployment (GitHub Actions)

| Workflow | When | What |
|---|---|---|
| `deploy.yml` | every push / PR | type-check, bundle the function, build the static site |
| `deploy.yml` | push to `main` | apply `db/schema.sql` to Neon `main`, deploy the Function (`neon deploy`), build the site against the Function URL, publish to GitHub Pages |
| `neon-preview.yml` | pull requests | create a Neon database branch `preview/pr-N` with the schema applied; delete it when the PR closes |

Needs the repo secret `NEON_API_KEY` and variable `NEON_PROJECT_ID` (both added by the Neon–GitHub connection) and Pages set to "GitHub Actions". The Realtime URL/secret are pulled from Neon during the workflow; nothing else is stored in GitHub.

## Local development

```bash
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL to the deployed function URL
npm run dev                        # http://localhost:3000 (allowed by the function's CORS list)
```

- Players: `/` (enter an email; role and team are assigned automatically)
- Facilitator: `/admin/` (default password `beergame2026` — change it after first login)
- Projector view: `/observer/`
- Database changes: edit `db/schema.sql` (idempotent) and run `DATABASE_URL=… npm run db:setup`, or merge to `main` and let the workflow apply it.

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Pages (player, lobby, game, results, admin, observer) |
| `functions/api/` | Neon Function entry point (`/rpc`, `/realtime`, CORS) |
| `lib/` | Game logic, types, browser API client; `lib/server/` holds DB access and commands |
| `db/schema.sql` | Database schema (idempotent) |
| `neon.ts` | Neon config: the function and Realtime allowed origins |
| `.github/workflows/` | CI, deploy, Neon preview branches |
| `DESIGN.md`, `STATUS.md` | Design notes and current status |

## Versions

Releases are git tags. `v0.1.0-supabase-baseline` is the original Supabase version; `v0.2.0-neon` is the Neon migration. Roll back with `git checkout <tag>`.
