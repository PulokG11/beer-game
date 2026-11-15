import { waitUntil } from '@neon/functions';
import { tickAll } from './commands';

// Keeps games moving with no browser open (F-03). Armed by any request; while at
// least one game is live it ticks every TICK_MS inside waitUntil (the Function
// stays alive up to 15 minutes after responding). It stops by itself when no game
// is live, so an idle database can still scale to zero. A later request re-arms it.

const TICK_MS = 2000;
const MAX_RUN_MS = 14 * 60_000;

const g = globalThis as unknown as { __beerGameTicker?: boolean; __beerGameArmedAt?: number };

/** Call after any request, and again after a command that may have made a game live. */
export function ensureTicker(): void {
  g.__beerGameArmedAt = Date.now();
  if (g.__beerGameTicker) return;
  g.__beerGameTicker = true;

  waitUntil((async () => {
    try {
      const end = Date.now() + MAX_RUN_MS;
      while (Date.now() < end) {
        const startedAt = Date.now();
        const live = await tickAll();
        // Stop only if nothing is live AND nothing re-armed us while we were ticking.
        if (live === 0 && (g.__beerGameArmedAt ?? 0) <= startedAt) break;
        await new Promise(r => setTimeout(r, TICK_MS));
      }
    } catch (e) {
      console.error('[ticker]', e);
    } finally {
      g.__beerGameTicker = false;
    }
  })());
}
