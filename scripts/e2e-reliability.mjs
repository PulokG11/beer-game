// Regression tests for TADD findings F-03 (server-side deadlines) and F-05 (unique team numbers).
// Usage: BASE=https://<function-url> ADMIN_PASSWORD=... node scripts/e2e-reliability.mjs
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
const DEFAULT = { totalRounds: 13, holdingCostPerUnit: 0.5, backlogCostPerUnit: 1, demandSchedule: [4,4,4,4,8,8,8,8,8,8,8,8,8], orderTimerSeconds: 30, summaryTimerSeconds: 10, autoAdvanceSummary: true };

await rpc('deleteAllGames', {}, true);

// ---- F-05: unique team numbering after deletion
const teams = [];
for (let t = 0; t < 3; t++) {
  let gid;
  for (let p = 0; p < 4; p++) gid = (await rpc('autoAssignPlayer', { email: `t${t}p${p}@x.dev` })).data.gameId;
  teams.push(gid);
}
let all = (await rpc('getAllGames')).data;
const num = g => Object.values(g.players)[0].teamNumber;
ok(all.map(num).sort().join() === '1,2,3', `3 full teams numbered ${all.map(num).sort().join(',')}`);
await rpc('deleteGame', { gameId: teams[1] }, true);          // delete team 2
const nxt = (await rpc('autoAssignPlayer', { email: 'newbie@x.dev' })).data;
ok(nxt.teamNumber === 4, `after deleting team 2, next team is #${nxt.teamNumber} (COUNT+1 would reuse 3)`);
all = (await rpc('getAllGames')).data;
ok(new Set(all.map(num)).size === all.length, 'all team numbers unique');
// concurrent first logins -> still unique
const burst = await Promise.all(Array.from({ length: 9 }, (_, i) => rpc('autoAssignPlayer', { email: `burst${i}@x.dev` })));
all = (await rpc('getAllGames')).data;
ok(new Set(all.map(num)).size === all.length, `concurrent burst keeps team numbers unique (${all.map(num).sort((a,b)=>a-b).join(',')})`);
ok(all.map(g => Object.values(g.players)[0].teamName).every((n, i, a) => a.indexOf(n) === i), 'team names unique');

// ---- F-03: game finishes with no client ever polling or submitting
await rpc('deleteAllGames', {}, true);
const cfg = { ...DEFAULT, totalRounds: 3, demandSchedule: [4, 4, 8], orderTimerSeconds: 5, summaryTimerSeconds: 2 };
ok((await rpc('updateSessionSettings', { gameConfig: cfg }, true)).ok, 'short-timer config saved');
let gid;
for (let p = 0; p < 4; p++) gid = (await rpc('autoAssignPlayer', { email: `idle${p}@x.dev` })).data.gameId;
await rpc('startSingleGame', { gameId: gid }, true);
const t0 = Date.now();
// the ONLY thing we do now is wait; no polling of getGame (it would arm the ticker) — use realtime-free sleep
await sleep(48000);
const g = await game(gid);
ok(g.state.phase === 'ended' && g.state.currentRound === 3, `idle game ended by itself: phase=${g.state.phase} round=${g.state.currentRound} after ${Math.round((Date.now()-t0)/1000)}s`);
ok(g.state.roles.manufacturer.orderHistory.length === 3, 'every round recorded exactly once');

// restore defaults
await rpc('updateSessionSettings', { gameConfig: DEFAULT }, true);
await rpc('deleteAllGames', {}, true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
