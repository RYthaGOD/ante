import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TxOddsAdapter } from './adapter.ts';
import type { Fixture, MatchResult } from './types.ts';

interface FixtureFile {
  fixtures: Fixture[];
  results: Record<string, { homeGoals: number; awayGoals: number }>;
}

const dataUrl = new URL('../../fixtures/fixtures.json', import.meta.url);

// Stand-in for the TxODDS feed until we have API creds. Reads canned fixtures
// and final scores; `getResult` returns null for matches that aren't final yet.
export class MockTxOddsAdapter implements TxOddsAdapter {
  private readonly data: FixtureFile;

  constructor(data?: FixtureFile) {
    this.data = data ?? JSON.parse(readFileSync(fileURLToPath(dataUrl), 'utf8'));
  }

  async listFixtures(): Promise<Fixture[]> {
    return this.data.fixtures;
  }

  async getResult(fixtureId: string): Promise<MatchResult | null> {
    const r = this.data.results[fixtureId];
    if (!r) return null;
    return {
      fixtureId,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      status: 'final',
      source: 'mock-txodds',
      settledAt: new Date().toISOString(),
    };
  }
}
