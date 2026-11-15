# Changelog

Each release is a git tag. Roll back a file with `git checkout <tag> -- <path>`; roll back everything with `git checkout <tag>`.

## v0.3.0-pages — GitHub Pages hosting + CI

Hosts the game on GitHub Pages with a Neon Function as its backend, and adds GitHub Actions.

### Changed
- Frontend is now a static export (`output: 'export'`, base path `/beer-game`); dynamic routes became query-string routes (`/lobby/?id=…`, `/game/?id=…`, `/results/?id=…`, `/admin/game/?id=…`).
- The API moved from Next.js route handlers to a Neon Function (`functions/api`, `POST /rpc` and `/realtime`) with an origin allow-list for CORS. `lib/server/*` is unchanged and shared.
- Env vars: browser uses `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BASE_PATH`; `DATABASE_URL` is only for `npm run db:setup`.

### Added
- `.github/workflows/deploy.yml` (type-check + build on every push/PR; on `main`: apply schema, deploy the Function, publish Pages).
- `.github/workflows/neon-preview.yml` (Neon database branch per PR, deleted on close).
- `neon.ts` (function + Realtime allowed origins), `functions/api/index.ts`, `lib/config.ts`, `lib/useGameId.ts`.

### Removed
- `app/api/*` route handlers (replaced by the Function).

### Rollback
`git checkout v0.2.0-neon` restores the Next.js-server version (needs a Node host such as Vercel); the Function-backed Pages site is this tag.

## v0.2.0-neon — Neon migration

Replaces Supabase with Neon (Postgres 18 + Realtime). Game rules and UI are unchanged.

### Changed
- All database access moved server-side (`app/api/rpc`, `lib/server/`); the browser no longer holds a DB credential.
- Every game command is a single locked transaction, so a round is processed exactly once on the server.
- Live updates use Neon Realtime sealed queries, with a polling safety net (3 s when disconnected, 15 s when live).
- Admin password is verified on the server and never returned to the browser; admin-only commands require it.
- Players can start a game or fill bots only while the facilitator allows self-start (enforced server-side).
- First-login team creation happens inside the login transaction (no duplicate teams under simultaneous logins).
- Orders are clamped to 0–100,000 and saved game config is validated on the server.
- API change: `submitOrder(gameId, role, amount)`; `submitBotOrdersAndProcess` / `recoverStuckGame` no longer take `processRound`.

### Added
- `db/schema.sql` (single idempotent schema) and `npm run db:setup`.
- `CHANGELOG.md`, real `README.md`.

### Removed
- `@supabase/supabase-js`, `lib/supabase.ts`, `supabase/*.sql`, `NEXT_PUBLIC_SUPABASE_*` and `NEXT_PUBLIC_ADMIN_PASSWORD` env vars.

### Rollback
`git checkout v0.1.0-supabase-baseline` restores the Supabase version (requires its Supabase project and env vars).

## v0.1.0-supabase-baseline

Unmodified import of NarasimhaKamathB/Beer-game @ `afcdd91` (Next.js 15 + Supabase), the rollback point before the Neon migration.
