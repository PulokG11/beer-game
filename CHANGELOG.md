# Changelog

Each release is a git tag. Roll back a file with `git checkout <tag> -- <path>`; roll back everything with `git checkout <tag>`.

## [Unreleased] — Neon migration

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
