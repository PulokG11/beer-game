# Beer Game — Project Status

**Last updated:** 15 November 2026  
**Repo:** https://github.com/PulokG11/beer-game (code originates from NarasimhaKamathB/Beer-game @ `afcdd91`)  
**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Neon (Postgres 18 + Realtime)  
**Neon project:** `beer-game` — id `bitter-hill-44270052`, AWS `ap-southeast-1` (Singapore), branch `main`  
**Versions / rollback:** see `CHANGELOG.md`. The Supabase version is tagged `v0.1.0-supabase-baseline` (`git checkout v0.1.0-supabase-baseline`).

---

## What is this?

A multiplayer Beer Distribution Game simulation for classroom/workshop use. 4 players per team play roles in a supply chain (Manufacturer → Distributor → Wholesaler → Retailer). Each week they place orders; costs accrue from holding inventory or running into backlog. The goal is to minimise total team cost while experiencing the Bullwhip Effect first-hand.

---

## Current Status: ✅ Neon backend + GitHub Pages hosting (live: https://pulokg11.github.io/beer-game/)

Hosting: static Next.js export on GitHub Pages (`/beer-game`) calling a Neon Function (`functions/api`). `.github/workflows/deploy.yml` type-checks/builds on every push and, on `main`, applies `db/schema.sql`, deploys the Function and publishes Pages; `neon-preview.yml` creates a Neon DB branch per PR. Details in `README.md`. The sections below that mention `app/api/*` describe the previous Next-server layout (tag `v0.2.0-neon`).


- Dev server: `npm run dev` → http://localhost:3000
- All screens implemented; verified against Neon (25-check API test + manual browser run: join → lobby → order → timer expiry → round summary → admin unlock)
- All database access is server-side (`/api/rpc`); the browser holds no DB credential
- Live updates via Neon Realtime (beta) with a polling safety net
- Tutorial animation wired into lobby (`/tutorial.html` via `TutorialModal.tsx`)
- Realtime allowed origins (set in `neon.ts` and applied by the deploy workflow): `https://pulokg11.github.io`, `http://localhost:3000`

---

## File Structure

```
beer-game/
├── app/
│   │                                # (game/lobby/results/admin-game pages read the game id from `?id=`)
│   │                                # Backend moved to functions/api/index.ts (Neon Function): POST /rpc, /realtime
│   ├── page.tsx                     # Login / email entry (auto-assigns player)
│   ├── lobby/[gameId]/page.tsx      # Waiting room + tutorial button
│   ├── game/[gameId]/page.tsx       # Main game screen (ordering phase + summary)
│   ├── results/[gameId]/page.tsx    # Post-game results tabs
│   ├── admin/
│   │   ├── page.tsx                 # Admin dashboard (create games, config, start)
│   │   └── game/[gameId]/page.tsx   # Per-game admin controls
│   └── observer/page.tsx            # Projector-friendly live view
├── components/                      # RolePanel, OrderTimer, WeeklySummary, SummaryTimer, GameResults,
│                                    # Analytics, Leaderboard, ObserverDashboard, TutorialModal, ui/
├── lib/
│   ├── types.ts                     # All TypeScript interfaces + constants
│   ├── gameLogic.ts                 # Pure functions: createInitialGameState, processRound, getBotOrder
│   ├── rows.ts                      # DB row ↔ Game/SessionSettings mappers (shared by server + browser)
│   ├── api.ts                       # Browser client: rpc() wrapper, subscriptions, admin session helpers
│   ├── realtime.ts                  # Browser Neon Realtime subscription + sealed-query renewal
│   └── server/
│       ├── db.ts                    # @neondatabase/serverless Pool + tx() helper
│       ├── commands.ts              # All commands as locked transactions + access control
│       └── realtime.ts              # Server-side sealing of live queries
├── db/schema.sql                    # Tables, assign_player_atomic(), cleanup trigger (idempotent)
├── scripts/db-setup.mjs             # `npm run db:setup` — applies db/schema.sql to DATABASE_URL
├── public/tutorial.html             # Self-contained animated tutorial (~62s, 6 slides)
├── .env.local                       # DATABASE_URL, NEON_REALTIME_URL, NEON_REALTIME_SECRET (git-ignored)
├── .env.local.example               # Template (safe to commit)
└── CHANGELOG.md
```

---

## Neon Setup (run once per new environment)

1. Create a Neon project on **Postgres 18** in a Realtime region (`aws-ap-southeast-1`, `aws-eu-central-1`, `aws-us-east-1`, `aws-us-east-2`). Realtime refuses to enable on Postgres 17.
2. Enable Realtime on the branch (console → Realtime, or `neon realtime enable`) and set **allowed origins** to every origin that serves the app (e.g. `http://localhost:3000`, `https://<your-app>.vercel.app`).
3. Create `.env.local` (see `.env.local.example`):

```env
DATABASE_URL=postgresql://…-pooler.…/neondb?sslmode=require   # pooled connection string
NEON_REALTIME_URL=https://ep-….rt.c-1.<region>.aws.neon.tech/
NEON_REALTIME_SECRET=nrt_live_…                               # server-only, never NEXT_PUBLIC_
```

4. Apply the schema: `npm run db:setup` (idempotent; creates `games`, `session_settings`, `assign_player_atomic()` and the 25-game cleanup trigger).
5. Hosting is automated: push to `main` and `deploy.yml` deploys the Function and the Pages site (needs repo secret `NEON_API_KEY`, variable `NEON_PROJECT_ID`, and Pages source set to "GitHub Actions"). The Realtime URL/secret are pulled from Neon in the workflow; for local dev set `NEXT_PUBLIC_API_URL` to the Function URL (see `.env.local.example`).

---


## Key Design Decisions

### Steady-state start
`seed = demandSchedule[0]` (default: 4). All roles start with:
- `inventory = 3 × seed` (default: 12)
- `incomingOrder = seed`, `incomingShipment = seed`
- `shipmentPipeline = [seed]` (manufacturer: `[seed, seed]` for its 2-slot pipeline)

### Demand schedule
Facilitator enters a comma-separated list in admin (e.g. `4,4,4,4,8,8,8,8,8,8,8,8,8`). Stored in `config.demandSchedule`. All clients use the same pre-stored schedule — no client-side random generation, no divergence.

### Autonomous progression (no halting)
- `roundStartedAt` / `summaryStartedAt` timestamps stored in DB.
- Any client whose timer fires first calls `submitBotOrdersAndProcess` or `advanceToNextRound`.
- Each command runs server-side in one transaction holding `SELECT … FOR UPDATE` on the game row, and no-ops if the phase already advanced. Round processing (`processRound`) therefore runs exactly once, on the server, however many clients fire at once.
- Pause/resume: `pausedAt` + `totalPausedMs` accumulate across cycles; all timers subtract this offset.

### Concurrent login safety
`assign_player_atomic` Postgres RPC acquires a `FOR UPDATE` row lock on `session_settings`, serialising all concurrent logins. Teams fill completely (Manufacturer → Distributor → Wholesaler → Retailer) before the next team opens.

### Bot heuristic
```typescript
getBotOrder(rs) = rs.incomingOrder <= 0 ? 0 : Math.max(1, Math.round(rs.incomingOrder * Math.random()))
```
Intentionally noisy to preserve the Bullwhip Effect. Never returns 0 when demand > 0.

### Lead times
- Retailer / Wholesaler / Distributor: 1-week pipeline (`shipmentPipeline[0]` arrives next round).
- Manufacturer: 2-week production pipeline (`[0]` arrives next, `[1]` arrives in 2 rounds).

### Order validation
- Min: 0, Max: 100,000 (clamped on submit, yellow warning shown if exceeded).
- Manufacturer labels: "Production order" and "Production ready" instead of order/shipment language.

### Session stale-handling
`app/page.tsx` calls `getGame()` before redirecting from localStorage. Stale/deleted game → clears all `beergame_*` localStorage keys and stays on the login screen. Lobby page also clears on "game not found" and shows a friendly "Session expired" screen.

---

## GameConfig Interface

```typescript
interface GameConfig {
  totalRounds: number;            // default: 13
  holdingCostPerUnit: number;     // default: 0.5  ($0.50/unit/week)
  backlogCostPerUnit: number;     // default: 1.0  ($1.00/unit/week, 2× holding)
  demandSchedule: number[];       // facilitator-specified; length === totalRounds
  orderTimerSeconds: number;      // default: 30
  summaryTimerSeconds: number;    // default: 10
  autoAdvanceSummary: boolean;    // default: true
}
```

Default demand schedule: `[4, 4, 4, 4, 8, 8, 8, 8, 8, 8, 8, 8, 8]` (classic step change at week 5).

---

## GameState Interface

```typescript
interface GameState {
  phase: 'lobby' | 'onboarding' | 'ordering' | 'processing' | 'summary' | 'ended';
  currentRound: number;
  roles: Record<Role, RoleState>;
  playersDoneOrdering: string[];   // roles that submitted this round
  roundStartedAt: number | null;   // Unix ms — ordering timer origin
  summaryStartedAt: number | null; // Unix ms — summary timer origin
  paused: boolean;
  pausedAt: number | null;
  totalPausedMs: number;           // accumulated pause duration this round
}
```

---

## Screens & Routes

| Route | Who sees it | Purpose |
|---|---|---|
| `/` | Players | Email login → auto-assign role + team |
| `/lobby/[gameId]` | Players | Waiting room, role card, team slots, tutorial |
| `/game/[gameId]` | Players | Main game: order input, stats, summary |
| `/results/[gameId]` | Players | Post-game: Results / Analytics / Leaderboard tabs |
| `/admin` | Facilitator | Create games, config editor, start per-game, observer link |
| `/admin/game/[gameId]` | Facilitator | Pause/resume, skip summary, fill bots, reset, per-role roster |
| `/observer` | Projector | Dark live view: all teams, phases, costs, leaderboard |

---

## Tutorial (`/tutorial.html`)

Self-contained animated HTML (~62 seconds, 6 slides). Amber/beer colour palette. Opened via `TutorialModal.tsx` (fullscreen iframe). Features:
- Click overlay to start
- ⏸ Pause / ▶ Resume button
- `scaleToFit()` — scales 1280×720 canvas to any screen/mobile size
- Slide 1: Supply chain (4 roles pop in)
- Slide 2: Lead times (2-week manufacturer, 1-week others)
- Slide 3: Order flow upstream (orders ripple ← with delays)
- Slide 4: Bullwhip Effect (bar chart shows demand 4→8 amplifying upstream)
- Slide 5: Costs ($0.50 holding, $1.00 backlog, team total)
- Slide 6: Title card — "🍺 THE BEER GAME"

Tutorial is shown in:
- **Lobby page** — button launches the modal while waiting for game to start
- **Results page** — TODO: add button here too (next session)

---

## LocalStorage Keys (player browser)

| Key | Value |
|---|---|
| `beergame_player_id` | Sanitised email used as player ID |
| `beergame_game_id` | Game row ID (e.g. `team_abc123`) |
| `beergame_role` | `manufacturer` / `distributor` / `wholesaler` / `retailer` |
| `beergame_team_name` | e.g. `Alpha Team` |
| `beergame_team_number` | Integer |
| `beergame_email` | Raw email |

All keys cleared on stale session detection or "Play again" from results screen.

---

## Known Working / Not Yet Done

### ✅ Working
- Full game loop: login → lobby → ordering → summary → … → results
- Autonomous timer progression (game never halts even if players go idle)
- Bot players fill any empty role on game start
- Admin: per-game ▶ Start, pause/resume, skip summary, fill bots, reset
- Admin: password gate (default `beergame2026`, stored in Neon, verified server-side and never sent to players, changeable from admin UI); kept in `sessionStorage` for the browser session and sent as an `x-admin-password` header on admin commands; "Lock" button to re-lock
- Admin: per-game 🗑 delete button with confirmation dialog
- Admin: `allowSelfStart` toggle — enables/disables player self-start from lobby
- Lobby: self-start card — "▶ Start game now" button when `allowSelfStart=true`; shows bot-fill progress messages and 💡 tooltip about 4 players / bots
- Observer projector view with live updates
- Analytics: SVG charts per role (orders, inventory, backlog)
- Leaderboard: ranks all ended games by total cost
- Tutorial animation (~62s, 6 slides) with pause/play, wired into lobby
- Mobile-responsive layouts
- Stale session handling (home page verifies game, clears localStorage if deleted)
- Postgres trigger `trg_cleanup_ended_games`: auto-deletes oldest ended game when count exceeds 25 (FIFO, active games never touched)
- TypeScript strict-mode clean (Vercel build passes)
- GitHub repo: https://github.com/PulokG11/beer-game
- Server-side transactions for all game commands; self-start policy and admin actions enforced on the server

### 🔜 Next steps (start here next session)
- Deploy to Vercel: add `DATABASE_URL`, `NEON_REALTIME_URL`, `NEON_REALTIME_SECRET`, and add the deployed origin to the Neon Realtime allowed origins
- End-to-end test with 4 human players across full 13 rounds
- Verify Bullwhip Effect is visible in Analytics charts after a real game
- Known gaps (unchanged by the migration): order timers are still browser-driven (a team with no open tab and no admin watchdog will not progress); role/player identity is unverified (anyone can submit for any role); admin password is plaintext in `session_settings` and has no rate limiting; Neon Realtime is beta (polling fallback covers outages)

---

## Day Log — 25 June 2026

Changes made this session (in order):

| # | Change | Files |
|---|---|---|
| 1 | SQL migration — adds `admin_password` and `allow_self_start` columns to `session_settings` | `supabase/add_admin_password_self_start.sql` |
| 2 | `SessionSettings` type — added `adminPassword: string` and `allowSelfStart: boolean` | `lib/types.ts` |
| 3 | Supabase client — reads/writes both new fields | `lib/supabase.ts` |
| 4 | Admin password gate — `/admin` shows a lock screen; correct password unlocks and caches auth in `sessionStorage` for the browser session; "Lock" button re-locks | `app/admin/page.tsx` |
| 5 | Admin: allow self-start toggle — checkbox in Event Settings; updates Supabase immediately | `app/admin/page.tsx` |
| 6 | Admin: change password field — lets facilitator update the admin password from within admin (after logging in) | `app/admin/page.tsx` |
| 7 | Lobby: self-start card — when `allowSelfStart=true`, shows "▶ Start game now" button with bot-fill progress messages and a 💡 tooltip about 4 players / bots | `app/lobby/[gameId]/page.tsx` |
| 8 | Lobby: messaging — header changes to "Ready to play?" vs "Waiting for game to start" based on self-start setting; empty-slot count shown dynamically | `app/lobby/[gameId]/page.tsx` |

**Supabase migration required:** Run `supabase/add_admin_password_self_start.sql` in the Supabase SQL editor before deploying.

---

## Day Log — 25 June 2026 (continued)

| # | Change | Files |
|---|---|---|
| 9 | `deleteGame(gameId)` — new Supabase function to delete a single game | `lib/supabase.ts` |
| 10 | Per-game 🗑 delete button in admin Games list — confirm dialog before deleting | `app/admin/page.tsx` |
| 11 | Postgres trigger `trg_cleanup_ended_games` — fires on every game UPDATE; if phase just became 'ended' and total ended games > 25, deletes oldest ended game(s) until 25 remain. Active/lobby games never touched. | `supabase/cleanup_ended_games_trigger.sql` |
| 12 | Build fix — `subscribeToSessionSettings` callback missing `adminPassword` + `allowSelfStart` fields | `lib/supabase.ts` |

**Additional Supabase step required:** Run `supabase/cleanup_ended_games_trigger.sql` in Supabase SQL Editor to install the auto-cleanup trigger.

---

## Running Locally

```powershell
cd C:\Users\narasimha.kamath\Documents\git\o9.Involve\beergame
npm install        # first time only
npm run dev        # → http://localhost:3000
```

Admin: http://localhost:3000/admin  
Observer: http://localhost:3000/observer

---

## Deploying to Vercel

Already live. For a fresh deployment (e.g. new Vercel account):

1. Import https://github.com/NarasimhaKamathB/Beer-game in Vercel.
2. Root directory: `/` (repo root is already the Next.js app).
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Auto-deploys on every push to `main` thereafter.

---

## Day Log — 24 June 2026

Changes made this session (in order):

| # | Change | Files |
|---|---|---|
| 1 | Tutorial animation — 6-slide animated HTML (~62s), amber beer theme, pause/play, scaleToFit mobile | `public/tutorial.html` |
| 2 | TutorialModal component — fullscreen iframe wrapper with "Got it ✓" close + Escape key | `components/TutorialModal.tsx` |
| 3 | Wired tutorial into lobby — dark amber clickable banner replaces old placeholder | `app/lobby/[gameId]/page.tsx` |
| 4 | Stale session fix — home page calls `getGame()` before redirecting; clears localStorage if game deleted/ended | `app/page.tsx` |
| 5 | Lobby "game not found" — clears localStorage automatically, shows friendly "Session expired" screen | `app/lobby/[gameId]/page.tsx` |
| 6 | Smart redirect on home — routes to `/game/[id]` if ordering/summary, `/results/[id]` if ended | `app/page.tsx` |
| 7 | Wrote STATUS.md — full project context document for future sessions | `STATUS.md` |
| 8 | GitHub push — deleted old repo, recreated clean, pushed local code to `main` | git |
| 9 | Vercel deployment — connected GitHub repo, added env vars, deployed | Vercel |
| 10 | TypeScript build fix — `cfg as unknown as Record<string, unknown>` to satisfy strict mode | `app/admin/page.tsx` |

---

## Day Log — 15 November 2026 (Neon migration)

Replaced Supabase with Neon because the free Supabase plan allows only 2 projects. Game rules and UI are unchanged. Rollback: `git checkout v0.1.0-supabase-baseline`.

| # | Change | Files |
|---|---|---|
| 1 | Created Neon project `beer-game` (Postgres 18, Singapore) and enabled Realtime (needs PG 18; a first PG 17 attempt was discarded) | Neon |
| 2 | Consolidated four Supabase SQL scripts into one idempotent schema; dropped RLS toggles, `anon` grants and the Supabase publication | `db/schema.sql`, `scripts/db-setup.mjs` |
| 3 | Server-side data layer on `@neondatabase/serverless`; every command is a locked transaction, so round processing runs once on the server | `lib/server/db.ts`, `lib/server/commands.ts`, `app/api/rpc/route.ts` |
| 4 | Browser client keeps the old function names but calls `/api/rpc`; live updates via Neon Realtime sealed queries, plus a 3s/15s polling safety net | `lib/api.ts`, `lib/realtime.ts`, `lib/server/realtime.ts`, `app/api/realtime/route.ts` |
| 5 | Admin password is now checked on the server and never returned to the browser; admin-only commands require it; players can start/fill bots only while self-start is enabled | `lib/server/commands.ts`, `app/admin/page.tsx` |
| 6 | New-team creation happens inside the login transaction, so simultaneous first logins can no longer create duplicate teams | `lib/server/commands.ts` |
| 7 | Removed `@supabase/supabase-js`, `lib/supabase.ts`, `supabase/` | — |

**Behaviour changes to be aware of:** `submitOrder` / `submitBotOrdersAndProcess` / `recoverStuckGame` no longer take a `processRound` argument; `submitOrder` takes a `gameId` instead of a `Game`; orders are clamped to 0–100,000 on the server; game config saved from admin is validated server-side.
