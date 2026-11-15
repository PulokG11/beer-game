# The Beer Game: Supply Chain Showdown

A multiplayer Beer Distribution Game for classrooms, workshops and quick games with friends. Four roles run a beer supply chain (Manufacturer → Distributor → Wholesaler → Retailer), place weekly orders, and try to keep team cost low while experiencing the Bullwhip Effect first-hand.

## Play it: https://pulokg11.github.io/beer-game/

**Stack:** Next.js 15 (static export) · TypeScript · Tailwind CSS · [Neon](https://neon.com) (Postgres 18 + Realtime + a Neon Function as the API) · GitHub Pages + GitHub Actions

See `CHANGELOG.md` for what changed.

## Two game modes

Pick a mode on the first screen.

| | **Champions Mode** | **Express Mode** |
|---|---|---|
| Who it is for | Classes and workshops with a facilitator | Anyone who wants to jump straight in |
| Sign-in | Email | **None.** No email, no account (optional nickname) |
| Teams | Assigned automatically, **exactly 4 players** per team | Formed automatically, **1 to 4 players** |
| Empty roles | Not allowed: a team cannot start until 4 players have joined | Played by **AI bots** |
| Role choice | Assigned in order | Choose **Manufacturer, Distributor, Wholesaler, Retailer or Random** |
| Who starts the game | The **facilitator** (admin panel), only once the team has 4 players | **Automatic**: when the team is full, when any player presses *Start now*, or after a 45 s lobby countdown |
| Facilitator needed | Yes | No |

In Express Mode the bots use a damped base-stock policy, and they order the moment every human on the team has ordered, so a solo game does not wait for the timer.

## Architecture

```
Browser (GitHub Pages, static)  ──HTTPS──▶  Neon Function "api"  ──▶  Neon Postgres 18
        ▲                                   POST /rpc, /realtime
        └───── Neon Realtime (WebSocket, server-sealed live queries) ──┘
```

- The site is a static export; it holds no database credential.
- All game logic runs in the Neon Function (`functions/api`, code in `lib/server/`). Every command is one locked transaction, so a round is processed exactly once even when several clients act at the same time.
- A server-side ticker processes overdue rounds even if every browser is closed (TADD finding F-03). Team numbers are unique under concurrency and after deletions (F-05).
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

- Players: `/` (choose Champions or Express)
- Facilitator (Champions only): `/admin/` (default password `beergame2026`; change it after first login)
- Projector view: `/observer/`
- Database changes: edit `db/schema.sql` (idempotent) and run `DATABASE_URL=… npm run db:setup`, or merge to `main` and let the workflow apply it.
- Tests: `npm run test:reliability` and `npm run test:modes` run against a function URL (`BASE=… ADMIN_PASSWORD=…`). They delete all games on the target, so use a scratch database.

## Look and feel

A "lager label" theme: golden lager, bottle green, label red and coastal blue, with Bebas Neue / Barlow type. The logo, bottle, glass, lime, hop and role icons are original SVG artwork inspired by classic lager colours; no brand's logo or trademark is used.

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Pages (mode picker, lobby, game, results, admin, observer) |
| `components/` | UI components; `Brand.tsx` holds the logo and illustrations |
| `functions/api/` | Neon Function entry point (`/rpc`, `/realtime`, CORS, ticker) |
| `lib/` | Game logic, types, browser API client; `lib/server/` holds DB access, commands and the ticker |
| `db/schema.sql` | Database schema (idempotent) |
| `neon.ts` | Neon config: the function and Realtime allowed origins |
| `.github/workflows/` | CI, deploy, Neon preview branches |
| `DESIGN.md`, `STATUS.md` | Design notes and current status |

## Versions

Releases are git tags: `v0.1.0-supabase-baseline` (original), `v0.2.0-neon`, `v0.3.0-pages`, `v0.3.1-reliability`, `v0.4.0-modes` (modes + theme) and `v0.4.1-deploy-verify`. Roll back with `git checkout <tag>`.
