import type { Fixture, MatchResult } from './types.ts';

// The single boundary between ANTE and TxODDS. Everything downstream — market
// derivation, on-chain settlement — depends only on this interface, so the mock
// feed and the real HTTP feed are swappable without touching the mechanism.
export interface TxOddsAdapter {
  listFixtures(): Promise<Fixture[]>;
  // Returns null until the match is final and TxODDS has a verified result.
  getResult(fixtureId: string): Promise<MatchResult | null>;
}
