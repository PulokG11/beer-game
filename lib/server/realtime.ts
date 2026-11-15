import { createRealtime, rawSql } from '@neon/realtime/server';
import type { GameRow, SettingsRow } from '../rows';

let realtime: ReturnType<typeof create> | undefined;

function create() {
  const secret = process.env.NEON_REALTIME_SECRET;
  if (!secret) throw new Error('NEON_REALTIME_SECRET is not set');
  return createRealtime({ secret, db: 'neondb' });
}

const GAME_COLS = 'id, code, host_id, config, state, players, created_at';

/**
 * Sealed live queries the browser may subscribe to. The password column is
 * never selected, and clients cannot alter a sealed query.
 */
export async function sealLiveQuery(kind: unknown, gameId: unknown) {
  const rt = (realtime ??= create());
  switch (kind) {
    case 'game': {
      if (typeof gameId !== 'string' || !gameId || gameId.length > 200) throw new Error('Invalid gameId');
      return rt.seal({ query: rawSql<GameRow>(`SELECT ${GAME_COLS} FROM games WHERE id = $1`, [gameId]) });
    }
    case 'games':
      return rt.seal({ query: rawSql<GameRow>(`SELECT ${GAME_COLS} FROM games ORDER BY created_at, id`) });
    case 'settings':
      return rt.seal({
        query: rawSql<SettingsRow & { id: number }>(
          'SELECT id, registration_open, game_config, event_name, allow_self_start FROM session_settings WHERE id = 1',
        ),
      });
    default:
      throw new Error('Unknown live query');
  }
}
