// End-to-end tests for Champions and Express modes (takes ~2 minutes: it waits out a lobby countdown).
// Usage: BASE=https://<function-url> ADMIN_PASSWORD=... node scripts/e2e-modes.mjs
// WARNING: deletes all games and temporarily changes the default game config on the target.
const BASE = process.env.BASE ?? 'http://localhost:8787';
const PW = process.env.ADMIN_PASSWORD ?? 'beergame2026';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rpc(cmd, args = {}, admin = false) {
  const r = await fetch(`${BASE}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', ...(admin ? { 'x-admin-password': PW } : {}) }, body: JSON.stringify({ cmd, args }) });
  return { status: r.status, ...(await r.json()) };
}
const game = async id => (await rpc('getGame', { gameId: id })).data;
const ROLES = ['manufacturer', 'distributor', 'wholesaler', 'retailer'];
const uid = () => 'ex_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const DEFAULT = { totalRounds: 13, holdingCostPerUnit: 0.5, backlogCostPerUnit: 1, demandSchedule: [4,4,4,4,8,8,8,8,8,8,8,8,8], orderTimerSeconds: 30, summaryTimerSeconds: 10, autoAdvanceSummary: true };

await rpc('deleteAllGames', {}, true);

// ===== Express: 1 player + 3 bots
const p1 = uid();
const j1 = await rpc('expressJoin', { playerId: p1, role: 'retailer', name: 'Solo' });
ok(j1.ok && j1.data.role === 'retailer', `express solo joins as ${j1.data?.role}`);
let g = await game(j1.data.gameId);
ok(g.config.mode === 'express' && g.state.phase === 'lobby' && g.state.lobbyDeadline > Date.now(), 'express lobby created with a countdown');
ok(Object.values(g.players).every(p => p.email === ''), 'no email stored for express players');
ok((await rpc('expressJoin', { playerId: p1, role: 'manufacturer', name: 'x' })).data.gameId === j1.data.gameId, 'rejoin returns the same seat');
// start: 1 human + 3 bots
ok((await rpc('expressStart', { gameId: j1.data.gameId, playerId: p1 })).ok, 'player starts the lobby');
g = await game(j1.data.gameId);
const bots = Object.values(g.players).filter(p => p.isBot);
ok(g.state.phase === 'ordering' && bots.length === 3 && bots.every(b => b.role !== 'retailer'), `1 human + ${bots.length} bots, phase=${g.state.phase}`);
// human orders -> bots fill immediately, round processes without waiting for the timer
const t0 = Date.now();
await rpc('submitOrder', { gameId: g.id, role: 'retailer', amount: 4 });
g = await game(g.id);
ok(g.state.currentRound === 1 && g.state.phase === 'summary', `round processed immediately after the only human ordered (${Date.now() - t0}ms)`);
const botOrders = ROLES.filter(r => r !== 'retailer').map(r => g.state.roles[r].orderHistory[0]);
ok(botOrders.every(o => Number.isInteger(o) && o >= 0), `AI bot orders are valid integers: ${botOrders.join(',')}`);

// ===== Express: 2 players, same lobby, different roles; random role never collides
await rpc('deleteAllGames', {}, true);
const a = uid(), b = uid();
const ja = await rpc('expressJoin', { playerId: a, role: 'distributor', name: 'A' });
const jb = await rpc('expressJoin', { playerId: b, role: 'distributor', name: 'B' }); // taken -> new lobby
ok(ja.data.gameId !== jb.data.gameId, 'requesting a taken role opens a separate lobby');
const jc = await rpc('expressJoin', { playerId: uid(), role: 'random', name: 'C' });
ok(jc.data.gameId === ja.data.gameId && jc.data.role !== 'distributor', `random fills the first open lobby with a free role (${jc.data.role})`);
// 4 humans -> auto start
const joined = [a];
const ids = [uid(), uid()];
const j3 = await rpc('expressJoin', { playerId: ids[0], role: 'random', name: 'D' });
const j4 = await rpc('expressJoin', { playerId: ids[1], role: 'random', name: 'E' });
const full = await game(ja.data.gameId);
const humans = Object.values(full.players).filter(p => !p.isBot);
ok(humans.length === 4 && new Set(humans.map(p => p.role)).size === 4, `4 humans hold 4 distinct roles: ${humans.map(h => h.role).join(',')}`);
ok(full.state.phase === 'ordering', 'full express team starts automatically');
ok(j3.ok && j4.ok, 'random joins succeed');

// ===== concurrency: 10 simultaneous express joins -> valid teams, unique numbers
await rpc('deleteAllGames', {}, true);
const burst = await Promise.all(Array.from({ length: 10 }, () => rpc('expressJoin', { playerId: uid(), role: 'random', name: '' })));
ok(burst.every(r => r.ok), 'all 10 concurrent express joins succeed');
const all = (await rpc('getAllGames')).data;
const nums = all.map(x => Object.values(x.players)[0].teamNumber);
ok(new Set(nums).size === all.length, `team numbers unique across ${all.length} lobbies (${nums.sort((x, y) => x - y).join(',')})`);
ok(all.every(x => { const h = Object.values(x.players).filter(p => !p.isBot); return new Set(h.map(p => p.role)).size === h.length && h.length <= 4; }), 'no role double-booked');
ok(burst.every(r => r.data.playerId.startsWith('ex_')), 'nicknames auto-generated for blank names: ' + all.map(x => Object.values(x.players)[0].name).slice(0, 3).join(' | '));

// ===== validation
ok((await rpc('expressJoin', { playerId: 'bad id!', role: 'random' })).status === 400, 'invalid player id rejected');
ok((await rpc('expressJoin', { playerId: uid(), role: 'king' })).status === 400, 'invalid role rejected');
const openLobby = all.find(x => x.state.phase === 'lobby');
const stranger = await rpc('expressStart', { gameId: openLobby.id, playerId: uid() });
ok(stranger.status === 403, 'non-member cannot start someone else\'s lobby (403)');

// ===== express lobby auto-start by the server ticker (no one clicks start)
await rpc('deleteAllGames', {}, true);
ok((await rpc('updateSessionSettings', { gameConfig: { ...DEFAULT, totalRounds: 2, demandSchedule: [4, 4], orderTimerSeconds: 5, summaryTimerSeconds: 2 } }, true)).ok, 'short config set');
const solo = uid();
const js = await rpc('expressJoin', { playerId: solo, role: 'wholesaler', name: 'Idle' });
console.log('  (waiting for the 45s lobby countdown + ticker...)');
await sleep(52000);
let sg = await game(js.data.gameId);
ok(sg.state.phase !== 'lobby', `lobby auto-started by the server after its countdown: phase=${sg.state.phase}`);
await sleep(30000);
sg = await game(js.data.gameId);
ok(sg.state.phase === 'ended', `idle solo express game (1 human + 3 bots) finished by itself: phase=${sg.state.phase}, round=${sg.state.currentRound}`);

// ===== Champions rules
await rpc('deleteAllGames', {}, true);
await rpc('updateSessionSettings', { gameConfig: DEFAULT }, true);
const c1 = await rpc('autoAssignPlayer', { email: 'champ1@x.dev' });
ok(c1.ok, 'champions email join still works');
const cg = await game(c1.data.gameId);
ok(cg.config.mode === 'champions', 'champions game is tagged mode=champions');
const early = await rpc('startSingleGame', { gameId: c1.data.gameId }, true);
ok(early.status === 409, `admin cannot start a 1/4 champions team (${early.status}: ${early.error})`);
ok((await rpc('startSingleGame', { gameId: c1.data.gameId })).status === 401, 'players cannot start a champions game (401)');
const sa0 = await rpc('startAllGames', {}, true);
ok(sa0.ok && sa0.data.started === 0 && sa0.data.incomplete === 1, `start-all skips incomplete team: ${JSON.stringify(sa0.data)}`);
for (let i = 2; i <= 4; i++) await rpc('autoAssignPlayer', { email: `champ${i}@x.dev` });
// an express join must not be pulled into champions and vice versa
await rpc('expressJoin', { playerId: uid(), role: 'random', name: 'X' });
const cl = (await rpc('getAllGames')).data;
ok(cl.filter(x => x.config.mode === 'champions').length === 1 && cl.filter(x => x.config.mode === 'express').length === 1, 'champions and express lobbies stay separate');
const sa = await rpc('startAllGames', {}, true);
ok(sa.data.started === 1 && sa.data.incomplete === 0, `start-all starts the full champions team only: ${JSON.stringify(sa.data)}`);
const cg2 = await game(c1.data.gameId);
ok(cg2.state.phase === 'ordering' && Object.values(cg2.players).every(p => !p.isBot), 'champions game runs with 4 humans and no bots');
const autoFill = await rpc('autoFillBotPlayers', { gameId: c1.data.gameId }, true);
ok(autoFill.status === 404, 'legacy fill-bots command is gone');
ok(!('allowSelfStart' in (await rpc('getSessionSettings')).data), 'self-start setting removed');

await rpc('deleteAllGames', {}, true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
