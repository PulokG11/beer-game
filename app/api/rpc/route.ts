import { NextResponse } from 'next/server';
import { ApiError, dispatch } from '../../../lib/server/commands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(req: Request) {
  let body: { cmd?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: noStore });
  }
  if (typeof body.cmd !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing cmd' }, { status: 400, headers: noStore });
  }
  const args = body.args && typeof body.args === 'object' ? (body.args as Record<string, unknown>) : {};

  try {
    const data = await dispatch(body.cmd, args, req.headers.get('x-admin-password'));
    return NextResponse.json({ ok: true, data: data ?? null }, { headers: noStore });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status, headers: noStore });
    }
    console.error(`[rpc:${body.cmd}]`, e);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500, headers: noStore });
  }
}
