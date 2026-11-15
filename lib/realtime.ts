import { API_URL } from './config';
import {
  createRealtimeClient, QueryRefreshController,
  type MaterializedLiveQuerySubscription, type RealtimeClient, type SealedLiveQuery,
} from '@neon/realtime/client';

type SealResponse<Row> = { url: string; query: SealedLiveQuery<Row> };

// One shared WebSocket for every subscription on the page.
let client: RealtimeClient | null = null;

async function seal<Row>(body: object): Promise<SealResponse<Row>> {
  const res = await fetch(`${API_URL}/realtime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Realtime seal failed (${res.status})`);
  return res.json();
}

export type LiveStatus = 'connecting' | 'live' | 'stale' | 'closed' | 'error';

/**
 * Subscribe to a server-sealed live query. `onRows` receives the complete
 * result set after every change. Returns an unsubscribe function.
 */
export function liveQuery<Row>(
  body: object,
  onRows: (rows: readonly Row[]) => void,
  onStatus: (status: LiveStatus) => void,
): () => void {
  let stopped = false;
  let sub: MaterializedLiveQuerySubscription<Row> | undefined;
  let refresh: QueryRefreshController<Row> | undefined;

  (async () => {
    try {
      const first = await seal<Row>(body);
      if (stopped) return;
      client ??= createRealtimeClient({ url: first.url });

      const s = client.subscribe<Row>(first.query);
      sub = s;
      s.onChange(snap => {
        onStatus(snap.status);
        if (snap.data) onRows(snap.data);
      });

      refresh = new QueryRefreshController<Row>({
        query: first.query,
        refreshQuery: async () => (await seal<Row>(body)).query,
        renewSubscription: q => s.renew(q),
        onRefreshExhausted: e => { console.error('[realtime] refresh stopped', e); onStatus('error'); },
        subscription: s,
      });
      refresh.start();
    } catch (e) {
      console.warn('[realtime] unavailable, falling back to polling', e);
      onStatus('error');
    }
  })();

  return () => {
    stopped = true;
    refresh?.stop();
    sub?.unsubscribe();
  };
}
