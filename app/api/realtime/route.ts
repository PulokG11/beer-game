import { NextResponse } from 'next/server';
import { sealLiveQuery } from '../../../lib/server/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store' };

// Returns a short-lived sealed query plus the Realtime endpoint. The sealing
// secret stays on the server; the browser only ever holds the sealed capability.
export async function POST(req: Request) {
  const url = process.env.NEON_REALTIME_URL;
  if (!url) return NextResponse.json({ error: 'Realtime is not configured' }, { status: 503, headers: noStore });

  try {
    const { kind, gameId } = await req.json();
    const query = await sealLiveQuery(kind, gameId);
    return NextResponse.json({ url, query }, { headers: noStore });
  } catch (e) {
    console.error('[realtime:seal]', e);
    return NextResponse.json({ error: 'Invalid live query request' }, { status: 400, headers: noStore });
  }
}
