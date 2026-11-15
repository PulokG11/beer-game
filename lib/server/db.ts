import { Pool, type PoolClient } from '@neondatabase/serverless';

// One pool per server process; survives Next.js dev hot reloads.
const g = globalThis as unknown as { __beerGamePool?: Pool };

export function pool(): Pool {
  if (!g.__beerGamePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    g.__beerGamePool = new Pool({ connectionString });
  }
  return g.__beerGamePool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
}

/** Run `fn` in a transaction; commits on success, rolls back on any throw. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw e;
  } finally {
    client.release();
  }
}
