-- =============================================================================
-- Beer Game — Neon (Postgres 18) schema
-- Idempotent: safe to re-run. Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- (or `npm run db:setup`). Replaces the four supabase/*.sql scripts.
--
-- Neon Realtime requires every subscribed table to have a primary key and
-- must NOT have row-level security enabled, so RLS is left off. Access control
-- lives in the Next.js API routes: the browser never holds a DB credential.
-- =============================================================================

-- ── Games ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id          TEXT   PRIMARY KEY,
  code        TEXT   UNIQUE NOT NULL,
  host_id     TEXT,
  config      JSONB  NOT NULL DEFAULT '{}',
  state       JSONB  NOT NULL DEFAULT '{}',
  players     JSONB  NOT NULL DEFAULT '{}',
  created_at  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- ── Session settings (single row) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_settings (
  id                INT     PRIMARY KEY DEFAULT 1,
  registration_open BOOLEAN NOT NULL DEFAULT TRUE,
  game_config       JSONB   DEFAULT NULL,
  event_name        TEXT    NOT NULL DEFAULT 'Beer Game',
  admin_password    TEXT    NOT NULL DEFAULT 'beergame2026',
  allow_self_start  BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO session_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Team numbering (F-05) ────────────────────────────────────────────────────
-- Next team number = highest number in use + 1, so numbers stay unique after
-- deletions (COUNT(*)+1 repeated them). Callers must hold the session_settings
-- row lock so concurrent callers cannot read the same maximum.
CREATE OR REPLACE FUNCTION next_team_number() RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MAX((p.value->>'teamNumber')::INT), 0) + 1
  FROM games g, jsonb_each(g.players) p
$$;

-- Unique, readable label per number: 'Alpha Team' … 'Papa Team', then 'Alpha Team 2', …
CREATE OR REPLACE FUNCTION team_label(n INT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY[
    'Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
    'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa'
  ])[((n - 1) % 16) + 1] || ' Team' || CASE WHEN n > 16 THEN ' ' || ((n - 1) / 16 + 1) ELSE '' END
$$;

-- ── assign_player_atomic (Champions Mode) ────────────────────────────────────
-- Serializes concurrent logins through a single row lock on session_settings.
-- Team-fill order: manufacturer → distributor → wholesaler → retailer; a team
-- fills completely before the next opens. Express Mode lobbies are never used.
CREATE OR REPLACE FUNCTION assign_player_atomic(p_email TEXT, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_email      TEXT    := LOWER(TRIM(p_email));
  v_player_id  TEXT    := REGEXP_REPLACE(LOWER(TRIM(p_email)), '[^a-z0-9]', '_', 'g');
  v_reg_open   BOOLEAN;
  v_game_row   RECORD;
  v_key        TEXT;
  v_val        JSONB;
  v_used       TEXT[];
  v_role       TEXT;
  v_team_name  TEXT;
  v_team_num   INT;
  v_game_id    TEXT;
  v_player_obj JSONB;
  v_i          INT;
  v_role_order TEXT[] := ARRAY['manufacturer','distributor','wholesaler','retailer'];
BEGIN
  SELECT registration_open INTO v_reg_open FROM session_settings WHERE id = 1 FOR UPDATE;

  -- 1. Return existing assignment if already in an active game
  FOR v_game_row IN
    SELECT id, players FROM games
    WHERE  state->>'phase' IN ('lobby','onboarding','ordering','processing','summary')
      AND  COALESCE(config->>'mode', 'champions') = 'champions'
    ORDER  BY created_at ASC
    FOR UPDATE
  LOOP
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_game_row.players)
    LOOP
      IF v_val->>'email' = v_email THEN
        RETURN jsonb_build_object(
          'playerId',   v_key,
          'gameId',     v_game_row.id,
          'role',       v_val->>'role',
          'teamName',   COALESCE(v_val->>'teamName', ''),
          'teamNumber', COALESCE((v_val->>'teamNumber')::INT, 1)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- 2. Registration gate
  IF NOT COALESCE(v_reg_open, TRUE) THEN
    RAISE EXCEPTION 'Registration is currently closed. Contact your session organiser.';
  END IF;

  -- 3. First lobby game with an open human slot
  v_game_id := NULL;
  FOR v_game_row IN
    SELECT id, players FROM games
    WHERE  state->>'phase' = 'lobby'
      AND  COALESCE(config->>'mode', 'champions') = 'champions'
    ORDER  BY created_at ASC
    FOR UPDATE
  LOOP
    v_used := ARRAY[]::TEXT[];
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_game_row.players)
    LOOP
      IF COALESCE((v_val->>'isBot')::BOOLEAN, FALSE) = FALSE THEN
        v_used := v_used || ARRAY[v_val->>'role'];
      END IF;
    END LOOP;

    IF array_length(v_used, 1) IS NULL OR array_length(v_used, 1) < 4 THEN
      v_role := NULL;
      FOR v_i IN 1..4 LOOP
        IF NOT (v_role_order[v_i] = ANY(COALESCE(v_used, ARRAY[]::TEXT[]))) THEN
          v_role := v_role_order[v_i];
          EXIT;
        END IF;
      END LOOP;

      v_team_name := NULL;
      v_team_num  := NULL;
      FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_game_row.players)
      LOOP
        IF COALESCE((v_val->>'isBot')::BOOLEAN, FALSE) = FALSE THEN
          v_team_name := v_val->>'teamName';
          v_team_num  := (v_val->>'teamNumber')::INT;
          EXIT;
        END IF;
      END LOOP;

      v_game_id := v_game_row.id;
      EXIT;
    END IF;
  END LOOP;

  -- 4a. Atomically join the existing game
  IF v_game_id IS NOT NULL THEN
    v_player_obj := jsonb_build_object(
      'id',         v_player_id,
      'name',       p_name,
      'email',      v_email,
      'role',       v_role,
      'isAdmin',    FALSE,
      'isBot',      FALSE,
      'joinedAt',   (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      'teamName',   COALESCE(v_team_name, ''),
      'teamNumber', COALESCE(v_team_num, 1)
    );

    UPDATE games
    SET    players = players || jsonb_build_object(v_player_id, v_player_obj)
    WHERE  id = v_game_id;

    RETURN jsonb_build_object(
      'playerId',   v_player_id,
      'gameId',     v_game_id,
      'role',       v_role,
      'teamName',   COALESCE(v_team_name, ''),
      'teamNumber', COALESCE(v_team_num, 1)
    );
  END IF;

  -- 4b. No open game — caller must create a new team
  v_team_num  := next_team_number();   -- safe: we hold the session_settings row lock
  v_team_name := team_label(v_team_num);

  RETURN jsonb_build_object(
    'needsCreate', TRUE,
    'teamNumber',  v_team_num,
    'teamName',    v_team_name,
    'playerId',    v_player_id
  );
END;
$$;

-- ── Auto-cleanup: keep at most 25 completed games ────────────────────────────
-- When a game transitions into phase='ended' and more than 25 ended games
-- exist, the oldest ended games (by created_at) are deleted.
CREATE OR REPLACE FUNCTION cleanup_ended_games()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_excess INT;
BEGIN
  IF NEW.state->>'phase' = 'ended' AND (OLD.state->>'phase' IS DISTINCT FROM 'ended') THEN
    SELECT COUNT(*) - 25 INTO v_excess FROM games WHERE state->>'phase' = 'ended';
    IF v_excess > 0 THEN
      DELETE FROM games
      WHERE id IN (
        SELECT id FROM games
        WHERE  state->>'phase' = 'ended'
        ORDER  BY created_at ASC
        LIMIT  v_excess
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_ended_games ON games;
CREATE TRIGGER trg_cleanup_ended_games
AFTER UPDATE ON games
FOR EACH ROW
EXECUTE FUNCTION cleanup_ended_games();
