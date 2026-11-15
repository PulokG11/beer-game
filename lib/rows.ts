import type { Game, GameConfig, SessionSettings } from './types';

// Row shapes as returned by Postgres (server queries) and by Neon Realtime (browser).
// Declared as type aliases so they satisfy the driver's row constraint.
export type GameRow = {
  id: string;
  code: string;
  host_id: string | null;
  config: unknown;
  state: unknown;
  players: unknown;
  created_at: string | number; // BIGINT: the driver returns it as a string
};

export type SettingsRow = {
  registration_open: boolean;
  game_config: unknown;
  event_name: string;
  allow_self_start: boolean;
};

/** JSONB normally arrives parsed; tolerate a JSON string from other transports. */
function json<T>(v: unknown, fallback: T): T {
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return (v ?? fallback) as T;
}

export function rowToGame(row: GameRow): Game {
  return {
    id:        row.id,
    code:      row.code,
    hostId:    row.host_id ?? '',
    config:    json(row.config, {} as Game['config']),
    state:     json(row.state, {} as Game['state']),
    players:   json(row.players, {} as Game['players']),
    createdAt: Number(row.created_at),
  };
}

export function settingsFromRow(row: SettingsRow | undefined): SessionSettings {
  return {
    registrationOpen: row?.registration_open ?? true,
    gameConfig:       row ? json<GameConfig | null>(row.game_config, null) : null,
    eventName:        row?.event_name ?? 'Beer Game',
    allowSelfStart:   row?.allow_self_start ?? true,
  };
}
