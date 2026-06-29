// Core domain types for the ANTE settlement oracle.

export type FixtureStatus = 'scheduled' | 'live' | 'final';

export interface Fixture {
  id: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string; // ISO 8601
  status: FixtureStatus;
}

export interface MatchResult {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
  status: 'final';
  // In production this carries the TxODDS attestation that makes settlement
  // verifiable; the mock leaves it as a synthetic source tag.
  source: string;
  settledAt: string; // ISO 8601
}

// Score markets resolve from a verified scoreline; custom markets resolve from a
// feeder-asserted YES/NO outcome (Upshot-style narrative bets).
export type MarketKind = 'home_win' | 'over_2_5' | 'custom';
export type Outcome = 'YES' | 'NO';

// The off-chain description of a market: title/art/resolution for the UI, plus
// the on-chain identity (`id` == the program's market_id seed).
export interface MarketMeta {
  id: string; // market_id (<= 48 chars), e.g. "wc2026-m01:home_win"
  title: string; // narrative headline shown on the card
  blurb: string;
  kind: MarketKind;
  fixtureId?: string; // present for score markets
  resolutionDate: string; // ISO 8601 — drives on-chain settle_after
  art?: string; // art key the frontend maps to a visual
}

export interface Resolution {
  marketId: string;
  winningOutcome: Outcome;
  // SHA-256 hex the feeder commits on-chain — the proof of settlement.
  resultDigest: string;
  resolvedAt: string; // ISO 8601
}
