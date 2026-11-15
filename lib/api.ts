import type { Game, Role, SessionSettings } from './types';
import { rowToGame, settingsFromRow, type GameRow, type SettingsRow } from './rows';
import { liveQuery, type LiveStatus } from './realtime';

// ─── Transport ────────────────────────────────────────────────────────────────
// All data access goes through /api/rpc (server-side, Neon). The browser never
// holds a database credential.

const ADMIN_KEY = 'beergame_admin_pw';

function storedAdminPassword(): string | null {
  try { return sessionStorage.getItem(ADMIN_KEY); } catch { return null; }
}

/** Remember the admin password for this browser session (sent as a header). */
export function setAdminSession(password: string): void {
  try { sessionStorage.setItem(ADMIN_KEY, password); } catch { /* storage unavailable */ }
}

export function clearAdminSession(): void {
  try { sessionStorage.removeItem(ADMIN_KEY); } catch { /* storage unavailable */ }
}

export function hasAdminSession(): boolean {
  return storedAdminPassword() !== null;
}

async function rpc<T = void>(
  cmd: string,
  args: Record<string, unknown> = {},
  adminPassword: string | null = storedAdminPassword(),
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminPassword) headers['x-admin-password'] = adminPassword;

  const res = await fetch('/api/rpc', {
    method: 'POST', headers, body: JSON.stringify({ cmd, args }), cache: 'no-store',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body.data as T;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getGame(gameId: string): Promise<Game | null> {
  try { return await rpc<Game | null>('getGame', { gameId }); } catch { return null; }
}

export async function getAllGames(): Promise<Game[]> {
  try { return await rpc<Game[]>('getAllGames'); } catch { return []; }
}

export async function getSessionSettings(): Promise<SessionSettings> {
  try { return await rpc<SessionSettings>('getSessionSettings'); } catch { return settingsFromRow(undefined); }
}

// ─── Real-time ────────────────────────────────────────────────────────────────
// Neon Realtime is in beta, so each subscription also polls as a safety net:
// every 3s while the live connection is down, every 15s while it is up.

function dedupe<T>(cb: (v: T) => void): (v: T) => void {
  let last: string | undefined;
  return v => {
    const s = JSON.stringify(v);
    if (s !== last) { last = s; cb(v); }
  };
}

function subscribe<Row, T>(
  body: object,
  toValue: (rows: readonly Row[]) => T,
  refetch: () => Promise<T>,
  cb: (v: T) => void,
): () => void {
  const emit = dedupe(cb);
  let status: LiveStatus = 'connecting';

  const stopLive = liveQuery<Row>(
    body,
    rows => emit(toValue(rows)),
    s => { status = s; },
  );

  let ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    if (status !== 'live' || ticks % 5 === 0) refetch().then(emit).catch(() => { /* next tick retries */ });
  }, 3000);

  return () => { stopLive(); clearInterval(timer); };
}

export function subscribeToGame(gameId: string, cb: (g: Game | null) => void): () => void {
  return subscribe<GameRow, Game | null>(
    { kind: 'game', gameId },
    rows => (rows[0] ? rowToGame(rows[0]) : null),
    () => getGame(gameId),
    cb,
  );
}

export function subscribeToAllGames(cb: (games: Game[]) => void): () => void {
  return subscribe<GameRow, Game[]>(
    { kind: 'games' },
    rows => rows.map(rowToGame),
    getAllGames,
    cb,
  );
}

export function subscribeToSessionSettings(cb: (s: SessionSettings) => void): () => void {
  return subscribe<SettingsRow, SessionSettings>(
    { kind: 'settings' },
    rows => settingsFromRow(rows[0]),
    getSessionSettings,
    cb,
  );
}

// ─── Players ──────────────────────────────────────────────────────────────────

export async function autoAssignPlayer(email: string): Promise<{
  playerId: string; gameId: string; role: Role; teamName: string; teamNumber: number;
}> {
  return rpc('autoAssignPlayer', { email });
}

// ─── Gameplay ─────────────────────────────────────────────────────────────────

/** Record an order. The server processes the round when the fourth order lands. */
export function submitOrder(gameId: string, role: Role, amount: number): Promise<void> {
  return rpc('submitOrder', { gameId, role, amount });
}

/** Order timer expired: the server fills missing orders with the bot heuristic. */
export function submitBotOrdersAndProcess(gameId: string): Promise<void> {
  return rpc('submitBotOrdersAndProcess', { gameId });
}

export function advanceToNextRound(gameId: string): Promise<void> {
  return rpc('advanceToNextRound', { gameId });
}

// ─── Lobby (self-start is enforced server-side unless the caller is admin) ────

export function autoFillBotPlayers(gameId: string): Promise<void> {
  return rpc('autoFillBotPlayers', { gameId });
}

export function startSingleGame(gameId: string): Promise<void> {
  return rpc('startSingleGame', { gameId });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** Check a candidate password against the server without storing it. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  try { await rpc('verifyAdmin', {}, password.trim()); return true; } catch { return false; }
}

export function updateSessionSettings(s: Partial<SessionSettings>): Promise<void> {
  return rpc('updateSessionSettings', s as Record<string, unknown>);
}

export async function updateAdminPassword(password: string): Promise<void> {
  await rpc('updateAdminPassword', { password });
  setAdminSession(password.trim()); // keep this browser session authorized
}

export const startAllGames    = () => rpc('startAllGames');
export const pauseGame        = (gameId: string) => rpc('pauseGame', { gameId });
export const resumeGame       = (gameId: string) => rpc('resumeGame', { gameId });
export const resetGameValues  = (gameId: string) => rpc('resetGameValues', { gameId });
export const resetGameFull    = (gameId: string) => rpc('resetGameFull', { gameId });
export const recoverStuckGame = (gameId: string) => rpc('recoverStuckGame', { gameId });
export const deleteGame       = (gameId: string) => rpc('deleteGame', { gameId });
export const deleteAllGames   = () => rpc('deleteAllGames');

export function addPlayerToTeam(
  gameId: string, email: string, role: Role, teamName: string, teamNumber: number,
): Promise<void> {
  return rpc('addPlayerToTeam', { gameId, email, role, teamName, teamNumber });
}

