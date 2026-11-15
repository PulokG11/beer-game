import { createHash, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { query, tx } from './db';
import { rowToGame, settingsFromRow, type GameRow, type SettingsRow } from '../rows';
import {
  DEFAULT_CONFIG, ROLES, ROLE_LABELS, EXPRESS_LOBBY_SECONDS,
  type Game, type GameConfig, type GameState, type Player, type Role, type SessionSettings,
} from '../types';
import { createInitialGameState, generateGameCode, getBotOrder, getSmartBotOrder, processRound } from '../gameLogic';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Args = Record<string, unknown>;

// ─── Argument helpers ─────────────────────────────────────────────────────────

function str(a: Args, key: string, max = 200): string {
  const v = a[key];
  if (typeof v !== 'string' || !v || v.length > max) throw new ApiError(400, `Invalid ${key}`);
  return v;
}

function roleArg(a: Args): Role {
  const r = a.role;
  if (typeof r !== 'string' || !(ROLES as string[]).includes(r)) throw new ApiError(400, 'Invalid role');
  return r as Role;
}

function formatName(email: string): string {
  return email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

const playerIdFor = (email: string) => email.replace(/[^a-z0-9]/g, '_');

function validEmail(v: unknown): string {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!e || e.length > 254 || !e.includes('@')) throw new ApiError(400, 'Enter a valid email address');
  return e;
}

// ─── Settings & admin auth ────────────────────────────────────────────────────

const SETTINGS_SQL = 'SELECT registration_open, game_config, event_name FROM session_settings WHERE id = 1';

/**
 * Pass the transaction client when called inside tx(): borrowing a second pool
 * connection there can starve the pool and deadlock under concurrent joins.
 */
async function getSettings(c?: PoolClient): Promise<SessionSettings> {
  const rows = c ? (await c.query<SettingsRow>(SETTINGS_SQL)).rows : await query<SettingsRow>(SETTINGS_SQL);
  return settingsFromRow(rows[0]);
}

const digest = (s: string) => createHash('sha256').update(s).digest();

export async function isAdminPassword(pw: string | null): Promise<boolean> {
  if (!pw) return false;
  const rows = await query<{ admin_password: string }>(
    'SELECT admin_password FROM session_settings WHERE id = 1',
  );
  const correct = rows[0]?.admin_password ?? 'beergame2026';
  return timingSafeEqual(digest(pw.trim()), digest(correct));
}

function validateConfig(c: unknown): GameConfig {
  const bad = (m: string): never => { throw new ApiError(400, `Invalid game config: ${m}`); };
  if (!c || typeof c !== 'object') return bad('missing');
  const o = c as Record<string, unknown>;
  const int = (k: string, min: number, max: number) => {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) bad(`${k} must be an integer ${min}–${max}`);
    return v as number;
  };
  const rate = (k: string) => {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1_000_000) bad(`${k} must be a non-negative number`);
    return v as number;
  };
  const totalRounds = int('totalRounds', 1, 52);
  const sched = o.demandSchedule;
  if (!Array.isArray(sched) || sched.length !== totalRounds ||
      sched.some(v => typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100_000)) {
    bad(`demandSchedule needs exactly ${totalRounds} whole numbers`);
  }
  return {
    totalRounds,
    holdingCostPerUnit:  rate('holdingCostPerUnit'),
    backlogCostPerUnit:  rate('backlogCostPerUnit'),
    demandSchedule:      sched as number[],
    orderTimerSeconds:   int('orderTimerSeconds', 5, 3600),
    summaryTimerSeconds: int('summaryTimerSeconds', 1, 3600),
    autoAdvanceSummary:  o.autoAdvanceSummary === true,
  };
}

// ─── Game transaction helpers ─────────────────────────────────────────────────

async function lockGame(c: PoolClient, id: string): Promise<Game | null> {
  const r = await c.query<GameRow>('SELECT * FROM games WHERE id = $1 FOR UPDATE', [id]);
  return r.rows[0] ? rowToGame(r.rows[0]) : null;
}

const saveState = (c: PoolClient, id: string, state: GameState) =>
  c.query('UPDATE games SET state = $2 WHERE id = $1', [id, JSON.stringify(state)]);

const savePlayers = (c: PoolClient, id: string, players: Record<string, Player>) =>
  c.query('UPDATE games SET players = $2 WHERE id = $1', [id, JSON.stringify(players)]);

/** Players map with a bot in every role no human holds; null when already full. */
function withBots(players: Record<string, Player>): Record<string, Player> | null {
  const humans = Object.values(players).filter(p => !p.isBot);
  const taken  = new Set(humans.map(p => p.role).filter(Boolean));
  const missing = ROLES.filter(r => !taken.has(r));
  if (!missing.length) return null;

  const next = { ...players };
  for (const role of missing) {
    const botId = `bot_${role}`;
    next[botId] = {
      id: botId, name: `Bot (${ROLE_LABELS[role]})`, email: `bot_${role}@system`,
      role, isAdmin: false, isBot: true, joinedAt: Date.now(),
      teamName: humans[0]?.teamName ?? '', teamNumber: humans[0]?.teamNumber ?? 1,
    };
  }
  return next;
}

function ordersOf(roles: Record<Role, { outgoingOrder: number }>): Record<Role, number> {
  return {
    retailer:     roles.retailer.outgoingOrder,
    wholesaler:   roles.wholesaler.outgoingOrder,
    distributor:  roles.distributor.outgoingOrder,
    manufacturer: roles.manufacturer.outgoingOrder,
  };
}

/** Run the pure round processor and stamp the summary start time. */
function advanceRound(processing: GameState, config: GameConfig): GameState {
  const next = processRound(processing, config, ordersOf(processing.roles));
  if (next.phase === 'summary') next.summaryStartedAt = Date.now();
  return next;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function getGame(a: Args): Promise<Game | null> {
  const rows = await query<GameRow>('SELECT * FROM games WHERE id = $1', [str(a, 'gameId')]);
  return rows[0] ? rowToGame(rows[0]) : null;
}

async function getAllGames(): Promise<Game[]> {
  const rows = await query<GameRow>('SELECT * FROM games ORDER BY created_at');
  return rows.map(rowToGame);
}

/**
 * Concurrent-safe join. The assign function locks session_settings and the
 * lobby games; creating a new team inside the same transaction keeps that lock
 * held, so two simultaneous first logins cannot both create "Team 1".
 */
async function autoAssignPlayer(a: Args) {
  const email = validEmail(a.email);
  const name  = formatName(email);

  return tx(async c => {
    const res = await c.query('SELECT assign_player_atomic($1, $2) AS r', [email, name]);
    const r = res.rows[0].r as {
      needsCreate?: boolean; playerId: string; gameId?: string; role?: Role;
      teamName: string; teamNumber: number;
    };
    if (!r.needsCreate) return r;

    const settings = await getSettings(c);
    const config: GameConfig = { ...(settings.gameConfig ?? DEFAULT_CONFIG), mode: 'champions' };
    const gameId   = 'team_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const playerId = playerIdFor(email);
    const role: Role = 'manufacturer';
    const player: Player = {
      id: playerId, name, email, role, isAdmin: false, isBot: false,
      joinedAt: Date.now(), teamName: r.teamName, teamNumber: r.teamNumber,
    };
    await c.query(
      'INSERT INTO games (id, code, host_id, config, state, players, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        gameId, generateGameCode(), playerId,
        JSON.stringify(config), JSON.stringify(createInitialGameState(config)),
        JSON.stringify({ [playerId]: player }), Date.now(),
      ],
    );
    return { playerId, gameId, role, teamName: r.teamName, teamNumber: r.teamNumber };
  }).catch(e => {
    // The SQL function raises P0001 for the closed-registration message.
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P0001') {
      throw new ApiError(400, (e as Error).message);
    }
    throw e;
  });
}

const humansOf = (g: Game) => Object.values(g.players).filter(p => !p.isBot);

function humansAllDone(g: Game, done: string[]): boolean {
  const roles = humansOf(g).map(p => p.role).filter(Boolean) as Role[];
  return roles.length > 0 && roles.every(r => done.includes(r));
}

async function submitOrder(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  const role   = roleArg(a);
  const amount = Math.min(100_000, Math.max(0, Math.trunc(Number(a.amount) || 0)));

  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game || game.state.phase !== 'ordering') return;
    if (game.state.roles[role]?.orderPlaced) return;

    const roles = {
      ...game.state.roles,
      [role]: { ...game.state.roles[role], orderPlaced: true, outgoingOrder: amount },
    };
    const done = [...(game.state.playersDoneOrdering ?? []), role];

    if (ROLES.every(r => done.includes(r))) {
      const processing: GameState = { ...game.state, roles, playersDoneOrdering: done, phase: 'processing' };
      await saveState(c, gameId, advanceRound(processing, game.config));
    } else if (game.config.mode === 'express' && humansAllDone(game, done)) {
      // Express: once every human has ordered, the AI bots order immediately (no waiting for the timer).
      await fillAndProcess(c, { ...game, state: { ...game.state, roles, playersDoneOrdering: done } });
    } else {
      await saveState(c, gameId, { ...game.state, roles, playersDoneOrdering: done });
    }
  });
}

// Shared round-driving cores. Callers hold the row lock and have checked the phase.

/** Fill every missing order with the bot heuristic and process the round. */
async function fillAndProcess(c: PoolClient, game: Game): Promise<void> {
  const roles = { ...game.state.roles };
  const done  = new Set(game.state.playersDoneOrdering ?? []);
  const botRoles = new Set(Object.values(game.players).filter(p => p.isBot).map(p => p.role));
  for (const role of ROLES) {
    if (!done.has(role)) {
      // Express AI bots use a damped base-stock policy; an idle human gets the noisy fallback.
      const order = game.config.mode === 'express' && botRoles.has(role)
        ? getSmartBotOrder(roles[role]) : getBotOrder(roles[role]);
      roles[role] = { ...roles[role], orderPlaced: true, outgoingOrder: order };
      done.add(role);
    }
  }
  const processing: GameState = { ...game.state, roles, playersDoneOrdering: [...done], phase: 'processing' };
  await saveState(c, game.id, advanceRound(processing, game.config));
}

async function advanceCore(c: PoolClient, game: Game): Promise<void> {
  await saveState(c, game.id, {
    ...game.state,
    phase: 'ordering', roundStartedAt: Date.now(), summaryStartedAt: null,
    paused: false, pausedAt: null, totalPausedMs: 0,
  });
}

/** Order timer expired: fill every missing order with the bot heuristic and process. */
async function submitBotOrdersAndProcess(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game || game.state.phase !== 'ordering') return; // another caller already processed
    await fillAndProcess(c, game);
  });
}

async function advanceToNextRound(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game || game.state.phase !== 'summary') return;
    await advanceCore(c, game);
  });
}

/** Recovery for a game left in 'processing' by an interrupted write. */
async function recoverStuckGame(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game || game.state.phase !== 'processing') return;
    await saveState(c, gameId, advanceRound(game.state, game.config));
  });
}

// ─── Server-side deadlines (F-03) ─────────────────────────────────────────────
// Browser timers are only a fast path. The Function's ticker (lib/server/ticker.ts)
// calls tickGame for every live game, so rounds progress with every browser closed.
// Deadlines are re-checked on the freshly locked row, so a stale read can never
// process a round early, and tickGame is idempotent with client-fired timers.

const DEADLINE_GRACE_MS = 1000;

export async function tickGame(gameId: string): Promise<void> {
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game) return;
    const { state, config } = game;
    if (state.paused) return;

    const now    = Date.now();
    const frozen = state.totalPausedMs || 0;

    if (state.phase === 'lobby' && config.mode === 'express' && state.lobbyDeadline && now >= state.lobbyDeadline) {
      await startExpressLobby(c, game);
    } else if (state.phase === 'ordering' && state.roundStartedAt &&
        now - state.roundStartedAt - frozen >= config.orderTimerSeconds * 1000 + DEADLINE_GRACE_MS) {
      await fillAndProcess(c, game);
    } else if (state.phase === 'summary' && state.summaryStartedAt && config.autoAdvanceSummary &&
        now - state.summaryStartedAt - frozen >= config.summaryTimerSeconds * 1000 + DEADLINE_GRACE_MS) {
      await advanceCore(c, game);
    } else if (state.phase === 'processing' && state.roundStartedAt &&
        now - state.roundStartedAt - frozen >= config.orderTimerSeconds * 1000 + 20_000) {
      await saveState(c, game.id, advanceRound(state, config));
    }
  });
}

/** Tick every live game once; returns how many games are still live. */
export async function tickAll(): Promise<number> {
  const rows = await query<{ id: string }>(
    "SELECT id FROM games WHERE state->>'phase' IN ('ordering','summary','processing') " +
    "OR (state->>'phase' = 'lobby' AND config->>'mode' = 'express')",
  );
  for (const r of rows) {
    try { await tickGame(r.id); } catch (e) { console.error(`[tick:${r.id}]`, e); }
  }
  return rows.length;
}

// ─── Champions Mode: facilitator starts, exactly four humans per team ─────────

type StartResult = 'started' | 'incomplete' | 'skipped';

async function startChampionsGame(c: PoolClient, gameId: string): Promise<StartResult> {
  const game = await lockGame(c, gameId);
  if (!game || !['lobby', 'onboarding'].includes(game.state?.phase)) return 'skipped';
  if (humansOf(game).length < ROLES.length) return 'incomplete';
  await saveState(c, gameId, {
    ...game.state, phase: 'ordering', roundStartedAt: Date.now(), summaryStartedAt: null,
  });
  return 'started';
}

async function startSingleGame(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  const result = await tx(c => startChampionsGame(c, gameId));
  if (result === 'incomplete') throw new ApiError(409, 'A team needs all 4 players before it can start.');
}

async function startAllGames(): Promise<{ started: number; incomplete: number }> {
  return tx(async c => {
    const r = await c.query<{ id: string }>(
      "SELECT id FROM games WHERE state->>'phase' IN ('lobby','onboarding') " +
      "AND COALESCE(config->>'mode','champions') = 'champions' ORDER BY created_at",
    );
    let started = 0, incomplete = 0;
    for (const row of r.rows) {
      const res = await startChampionsGame(c, row.id);
      if (res === 'started') started++; else if (res === 'incomplete') incomplete++;
    }
    return { started, incomplete };
  });
}

// ─── Express Mode: anonymous, automatic, AI bots fill the empty roles ─────────

const PLAYER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const NAME_ADJ  = ['Thirsty', 'Frothy', 'Golden', 'Crisp', 'Hoppy', 'Mellow', 'Zesty', 'Bubbly', 'Chilled', 'Malty'];
const NAME_NOUN = ['Otter', 'Falcon', 'Brewer', 'Badger', 'Lynx', 'Heron', 'Mantis', 'Bison', 'Wolf', 'Fox'];
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

function cleanNickname(v: unknown): string {
  const n = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : '';
  return n || `${pick(NAME_ADJ)} ${pick(NAME_NOUN)}`;
}

/** Lobby ends and the game begins: bots take every role no human holds. */
async function startExpressLobby(c: PoolClient, game: Game): Promise<void> {
  const players = withBots(game.players);
  if (players) await savePlayers(c, game.id, players);
  await saveState(c, game.id, {
    ...game.state, phase: 'ordering', roundStartedAt: Date.now(), summaryStartedAt: null, lobbyDeadline: null,
  });
}

const freeRoles = (g: Game): Role[] => {
  const taken = new Set(humansOf(g).map(p => p.role));
  return ROLES.filter(r => !taken.has(r));
};

/**
 * Join (or create) an Express lobby. No email: the browser supplies a random
 * player id. Holds the same session_settings lock as Champions logins, so team
 * numbers stay unique across both modes (F-05).
 */
async function expressJoin(a: Args) {
  const playerId = str(a, 'playerId', 64);
  if (!PLAYER_ID_RE.test(playerId)) throw new ApiError(400, 'Invalid playerId');
  const choice = a.role === 'random' ? 'random' : roleArg(a);
  const name = cleanNickname(a.name);

  return tx(async c => {
    await c.query('SELECT 1 FROM session_settings WHERE id = 1 FOR UPDATE');

    // Already seated in a live Express game? Return that seat.
    const mine = await c.query<GameRow>(
      "SELECT * FROM games WHERE config->>'mode' = 'express' " +
      "AND state->>'phase' IN ('lobby','ordering','processing','summary') " +
      'AND jsonb_exists(players, $1) FOR UPDATE',
      [playerId],
    );
    if (mine.rows[0]) {
      const g = rowToGame(mine.rows[0]);
      const p = g.players[playerId];
      return { playerId, gameId: g.id, role: p.role as Role, teamName: p.teamName, teamNumber: p.teamNumber };
    }

    const lobbies = await c.query<GameRow>(
      "SELECT * FROM games WHERE config->>'mode' = 'express' AND state->>'phase' = 'lobby' " +
      'ORDER BY created_at FOR UPDATE',
    );

    let target: Game | undefined;
    let role: Role | undefined;
    for (const row of lobbies.rows) {
      const g = rowToGame(row);
      const free = freeRoles(g);
      if (choice === 'random' ? free.length > 0 : free.includes(choice)) {
        target = g;
        role = choice === 'random' ? pick(free) : choice;
        break;
      }
    }

    if (target && role) {
      const first = humansOf(target)[0];
      const player: Player = {
        id: playerId, name, email: '', role, isAdmin: false, isBot: false,
        joinedAt: Date.now(), teamName: first?.teamName ?? '', teamNumber: first?.teamNumber ?? 1,
      };
      const players = { ...target.players, [playerId]: player };
      await savePlayers(c, target.id, players);
      const updated: Game = { ...target, players };
      if (humansOf(updated).length >= ROLES.length) await startExpressLobby(c, updated); // team is full: go
      return { playerId, gameId: target.id, role, teamName: player.teamName, teamNumber: player.teamNumber };
    }

    // No suitable lobby: open a new one.
    const settings = await getSettings(c);
    const config: GameConfig = { ...(settings.gameConfig ?? DEFAULT_CONFIG), mode: 'express', autoAdvanceSummary: true };
    const num = (await c.query<{ n: number }>('SELECT next_team_number() AS n')).rows[0].n;
    const label = (await c.query<{ l: string }>('SELECT team_label($1) AS l', [num])).rows[0].l;
    const myRole: Role = choice === 'random' ? pick(ROLES) : choice;
    const gameId = 'xp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const state = createInitialGameState(config);
    state.lobbyDeadline = Date.now() + EXPRESS_LOBBY_SECONDS * 1000;
    const player: Player = {
      id: playerId, name, email: '', role: myRole, isAdmin: false, isBot: false,
      joinedAt: Date.now(), teamName: label, teamNumber: num,
    };
    await c.query(
      'INSERT INTO games (id, code, host_id, config, state, players, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [gameId, generateGameCode(), playerId, JSON.stringify(config), JSON.stringify(state),
       JSON.stringify({ [playerId]: player }), Date.now()],
    );
    return { playerId, gameId, role: myRole, teamName: label, teamNumber: num };
  });
}

/** Any seated player may start their Express lobby now; AI bots fill the other roles. */
async function expressStart(a: Args): Promise<void> {
  const gameId   = str(a, 'gameId');
  const playerId = str(a, 'playerId', 64);
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game || game.config.mode !== 'express' || game.state.phase !== 'lobby') return;
    const p = game.players[playerId];
    if (!p || p.isBot) throw new ApiError(403, 'You are not in this team.');
    await startExpressLobby(c, game);
  });
}

async function pauseGame(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game || game.state.paused) return;
    await saveState(c, gameId, { ...game.state, paused: true, pausedAt: Date.now() });
  });
}

async function resumeGame(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game || !game.state.paused) return;
    const pausedMs = game.state.pausedAt ? Date.now() - game.state.pausedAt : 0;
    await saveState(c, gameId, {
      ...game.state, paused: false, pausedAt: null,
      totalPausedMs: (game.state.totalPausedMs || 0) + pausedMs,
    });
  });
}

async function addPlayerToTeam(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  const email  = validEmail(a.email);
  const role   = roleArg(a);
  const teamName   = typeof a.teamName === 'string' ? a.teamName.slice(0, 100) : '';
  const teamNumber = Number.isInteger(a.teamNumber) ? (a.teamNumber as number) : 1;

  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game) throw new ApiError(404, 'Game not found');
    const playerId = playerIdFor(email);
    const players: Record<string, Player> = {};
    for (const [pid, p] of Object.entries(game.players)) {
      if (p.role === role && p.isBot) continue; // replace the bot in this role
      if (pid === playerId) continue;           // drop any stale entry for the same email
      players[pid] = p;
    }
    players[playerId] = {
      id: playerId, name: formatName(email), email, role,
      isAdmin: false, isBot: false, joinedAt: Date.now(), teamName, teamNumber,
    };
    await savePlayers(c, gameId, players);
  });
}

async function resetGameValues(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game) return;
    const fresh = createInitialGameState(game.config);
    fresh.phase = 'ordering';
    fresh.roundStartedAt = Date.now();
    await saveState(c, gameId, fresh);
  });
}

async function resetGameFull(a: Args): Promise<void> {
  const gameId = str(a, 'gameId');
  await tx(async c => {
    const game = await lockGame(c, gameId);
    if (!game) return;
    await c.query('UPDATE games SET state = $2, players = $3 WHERE id = $1', [
      gameId, JSON.stringify(createInitialGameState(game.config)), '{}',
    ]);
  });
}

async function deleteGame(a: Args): Promise<void> {
  await query('DELETE FROM games WHERE id = $1', [str(a, 'gameId')]);
}

async function deleteAllGames(): Promise<void> {
  await query('DELETE FROM games');
}

async function updateSessionSettings(a: Args): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };

  if (a.registrationOpen !== undefined) set('registration_open', a.registrationOpen === true);
  if (a.eventName        !== undefined) set('event_name', str(a, 'eventName', 100));
  if (a.gameConfig       !== undefined) set('game_config', JSON.stringify(validateConfig(a.gameConfig)));
  if (!sets.length) return;
  await query(`UPDATE session_settings SET ${sets.join(', ')} WHERE id = 1`, vals);
}

async function updateAdminPassword(a: Args): Promise<void> {
  const pw = str(a, 'password', 200).trim();
  if (!pw) throw new ApiError(400, 'Password cannot be empty');
  await query('UPDATE session_settings SET admin_password = $1 WHERE id = 1', [pw]);
}

// ─── Dispatch table ───────────────────────────────────────────────────────────
// public: anyone may call (players, projector).
// admin:  requires the admin password header.

type Access = 'public' | 'admin';
const commands: Record<string, { access: Access; run: (a: Args) => Promise<unknown> }> = {
  getGame:                  { access: 'public',    run: getGame },
  getAllGames:              { access: 'public',    run: getAllGames },
  getSessionSettings:       { access: 'public',    run: () => getSettings() },
  autoAssignPlayer:         { access: 'public',    run: autoAssignPlayer },
  submitOrder:              { access: 'public',    run: submitOrder },
  submitBotOrdersAndProcess:{ access: 'public',    run: submitBotOrdersAndProcess },
  advanceToNextRound:       { access: 'public',    run: advanceToNextRound },
  expressJoin:              { access: 'public',    run: expressJoin },
  expressStart:             { access: 'public',    run: expressStart },
  startSingleGame:          { access: 'admin',     run: startSingleGame },
  verifyAdmin:              { access: 'admin',     run: async () => true },
  startAllGames:            { access: 'admin',     run: startAllGames },
  pauseGame:                { access: 'admin',     run: pauseGame },
  resumeGame:               { access: 'admin',     run: resumeGame },
  addPlayerToTeam:          { access: 'admin',     run: addPlayerToTeam },
  resetGameValues:          { access: 'admin',     run: resetGameValues },
  resetGameFull:            { access: 'admin',     run: resetGameFull },
  recoverStuckGame:         { access: 'admin',     run: recoverStuckGame },
  deleteGame:               { access: 'admin',     run: deleteGame },
  deleteAllGames:           { access: 'admin',     run: deleteAllGames },
  updateSessionSettings:    { access: 'admin',     run: updateSessionSettings },
  updateAdminPassword:      { access: 'admin',     run: updateAdminPassword },
};

export async function dispatch(cmd: string, args: Args, adminPw: string | null): Promise<unknown> {
  const def = Object.hasOwn(commands, cmd) ? commands[cmd] : undefined;
  if (!def) throw new ApiError(404, `Unknown command: ${cmd}`);

  if (def.access === 'admin' && !(await isAdminPassword(adminPw))) {
    throw new ApiError(401, 'Incorrect admin password');
  }
  return def.run(args);
}
