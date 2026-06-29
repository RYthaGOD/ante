import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MarketMeta, Outcome } from '../txodds/types.ts';

const marketsUrl = new URL('../../fixtures/markets.json', import.meta.url);
const customOutcomesUrl = new URL('../../fixtures/custom-outcomes.json', import.meta.url);

// The catalogue of markets the platform lists. Both the feeder (to create &
// settle on-chain) and the frontend (titles/art/resolution) read this.
export function loadMarkets(): MarketMeta[] {
  return JSON.parse(readFileSync(fileURLToPath(marketsUrl), 'utf8'));
}

// Demo "verified narrative outcomes" for custom markets — in production these
// come from TxODDS-derived events, not a static file.
export function loadCustomOutcomes(): Record<string, Outcome> {
  return JSON.parse(readFileSync(fileURLToPath(customOutcomesUrl), 'utf8'));
}

export function isResolvable(meta: MarketMeta, now = new Date()): boolean {
  return new Date(meta.resolutionDate).getTime() <= now.getTime();
}
