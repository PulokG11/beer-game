import { ApiError, dispatch } from '../../lib/server/commands';
import { sealLiveQuery } from '../../lib/server/realtime';
import { ensureTicker } from '../../lib/server/ticker';

// Neon Function: the game's backend. DATABASE_URL is injected by Neon;
// NEON_REALTIME_URL / NEON_REALTIME_SECRET / ALLOWED_ORIGINS come from neon.ts.
// The static site on GitHub Pages calls this directly, so CORS is required.

// Commit this build came from (set by the deploy workflow); shown on /health so a deploy can be verified.
const BUILD = process.env.BUILD_SHA ?? 'dev';

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'private, no-store' };
  const origin = req.headers.get('origin');
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin']  = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'content-type, x-admin-password';
    headers['Access-Control-Max-Age']       = '86400';
  }
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(req) });
}

async function rpc(req: Request): Promise<Response> {
  let body: { cmd?: unknown; args?: unknown };
  try { body = await req.json(); } catch { return json(req, { ok: false, error: 'Invalid JSON' }, 400); }
  if (typeof body.cmd !== 'string') return json(req, { ok: false, error: 'Missing cmd' }, 400);
  const args = body.args && typeof body.args === 'object' ? (body.args as Record<string, unknown>) : {};

  try {
    const data = await dispatch(body.cmd, args, req.headers.get('x-admin-password'));
    ensureTicker(); // a command may just have made a game live
    return json(req, { ok: true, data: data ?? null });
  } catch (e) {
    if (e instanceof ApiError) return json(req, { ok: false, error: e.message }, e.status);
    console.error(`[rpc:${body.cmd}]`, e);
    return json(req, { ok: false, error: 'Internal error' }, 500);
  }
}

async function realtime(req: Request): Promise<Response> {
  const url = process.env.NEON_REALTIME_URL;
  if (!url) return json(req, { error: 'Realtime is not configured' }, 503);
  try {
    const { kind, gameId } = await req.json();
    return json(req, { url, query: await sealLiveQuery(kind, gameId) });
  } catch (e) {
    console.error('[realtime:seal]', e);
    return json(req, { error: 'Invalid live query request' }, 400);
  }
}

export default {
  async fetch(req: Request): Promise<Response> {
    const pathname = new URL(req.url).pathname.replace(/\/{2,}/g, '/');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) return json(req, { ok: true, build: BUILD });
    if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
    ensureTicker(); // keep live games moving even with no browser open (F-03)
    if (pathname === '/rpc')      return rpc(req);
    if (pathname === '/realtime') return realtime(req);
    return json(req, { error: 'Not found' }, 404);
  },
};
